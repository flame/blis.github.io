let db = null;
let chartInstance = null;
let SQL = null;
let currentView = 'overview'; // 'overview' or 'detail'
let currentMachine = null;

// Progress tracking
let progressInterval = null;

// Database Initialization
async function initializeDatabase() {
    if (SQL) return;

    // Properly initialize SQL.js
    SQL = await window.initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
    });
}

// Auto-load database with progress tracking
async function autoLoadDatabase() {
    showLoading();
    updateProgress(10);

    try {
        // Initialize SQL.js if needed
        await initializeDatabase();
        updateProgress(30);

        // Fetch perf.sqlite from the server
        const response = await fetch('perf.sqlite');

        if (!response.ok) {
            throw new Error(`Failed to fetch database: ${response.statusText}`);
        }

        // Track download progress
        const contentLength = response.headers.get('content-length');
        let loadedLength = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            loadedLength += value.length;

            if (contentLength) {
                const percentComplete = Math.round((loadedLength / contentLength) * 100);
                updateProgress(30 + (percentComplete * 0.6) / 100); // 30-60% for download
            }
        }

        const arrayBuffer = new Uint8Array(loadedLength);
        let position = 0;
        for (const chunk of chunks) {
            arrayBuffer.set(chunk, position);
            position += chunk.length;
        }

        updateProgress(70);

        // Load database
        db = new SQL.Database(arrayBuffer);
        updateProgress(90);

        const dbStatus = document.getElementById('db-status');
        dbStatus.textContent = '✓ Database loaded: perf.sqlite';
        dbStatus.classList.add('loaded');

        updateProgress(100);

        // Slight delay for visual feedback
        setTimeout(() => {
            clearLoading();
            document.getElementById('db-loader').style.display = 'none';
            loadMachineOverview();
        }, 300);
    } catch (error) {
        showError(`Failed to load database: ${error.message}`);
        clearLoading();
    }
}

// Progress update function
function updateProgress(percentage) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    if (progressFill && progressText) {
        progressFill.style.width = percentage + '%';
        progressText.textContent = Math.round(percentage) + '%';
    }
}

async function loadDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading();

    try {
        // Initialize SQL.js if needed
        await initializeDatabase();

        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        db = new SQL.Database(data);

        document.getElementById('db-status').textContent = `✓ Database loaded: ${file.name}`;
        document.getElementById('db-status').classList.add('loaded');

        showSuccess(`Database loaded successfully: ${file.name}`);
        clearLoading();

        // Load machine overview
        loadMachineOverview();
    } catch (error) {
        showError(`Failed to load database: ${error.message}`);
        clearLoading();
    }
}

// UI Control Functions

function clearMessages() {
    document.getElementById('error-message').classList.remove('active');
    document.getElementById('success-message').classList.remove('active');
}

// View Management Functions
function switchView(toView) {
    const fromView = currentView === 'overview' ? 'overview-view' : 'detail-view';
    const toViewElement = toView === 'overview' ? 'overview-view' : 'detail-view';

    const fromElement = document.getElementById(fromView);
    const toElement = document.getElementById(toViewElement);

    if (currentView === toView) return;

    // Animate out current view
    fromElement.classList.add('exiting');

    // After animation, switch views
    setTimeout(() => {
        fromElement.classList.remove('active', 'exiting');
        toElement.classList.add('active');
        currentView = toView;
    }, 500);
}

function backToOverview() {
    switchView('overview');
}

function showError(message) {
    clearMessages();
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.add('active');
}

function showSuccess(message) {
    clearMessages();
    const successDiv = document.getElementById('success-message');
    successDiv.textContent = message;
    successDiv.classList.add('active');
}

function showLoading() {
    // Loading indicator no longer needed
}

function clearLoading() {
    // Loading indicator no longer needed
}

function showParams(params, plotType) {
    // Parameters display no longer needed
}

// Database Query Functions
function queryDatabase(query, params = []) {
    if (!db) {
        throw new Error('Database not loaded');
    }

    const stmt = db.prepare(query);
    stmt.bind(params);

    const result = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        result.push(row);
    }
    stmt.free();

    return result;
}

function getParam(id) {
    const value = document.getElementById(id).value;
    if (value === '' || value === '-1') return -1;
    return isNaN(value) ? value : parseInt(value);
}

function queryHistoricalPlot(machine, op, dt, threads, tag, m, n, k) {
    let query = 'SELECT timestamp, gflops FROM run WHERE 1=1';
    const params = [];

    if (machine !== -1) {
        query += ' AND machine = ?';
        params.push(machine);
    }
    if (op !== -1) {
        query += ' AND op = ?';
        params.push(op);
    }
    if (dt !== -1) {
        query += ' AND dt = ?';
        params.push(dt);
    }
    if (threads !== -1) {
        query += ' AND threads = ?';
        params.push(threads);
    }
    if (tag !== -1) {
        query += ' AND tag = ?';
        params.push(tag);
    }
    if (m !== -1) {
        query += ' AND m = ?';
        params.push(m);
    }
    if (n !== -1) {
        query += ' AND n = ?';
        params.push(n);
    }
    if (k !== -1) {
        query += ' AND k = ?';
        params.push(k);
    }

    query += ' ORDER BY timestamp ASC';

    return queryDatabase(query, params);
}

function queryScalingPlot(git, machine, op, dt, threads, m, n, k) {
    let query = 'SELECT m, n, k, gflops FROM run WHERE git = ?';
    const params = [git];

    // Determine varying dimension
    let varyingDim;
    if (m === -1) varyingDim = 'm';
    else if (n === -1) varyingDim = 'n';
    else if (k === -1) varyingDim = 'k';
    else varyingDim = 'm'; // Default if all specified

    if (machine !== -1) {
        query += ' AND machine = ?';
        params.push(machine);
    }
    if (op !== -1) {
        query += ' AND op = ?';
        params.push(op);
    }
    if (dt !== -1) {
        query += ' AND dt = ?';
        params.push(dt);
    }
    if (threads !== -1) {
        query += ' AND threads = ?';
        params.push(threads);
    }
    if (m !== -1) {
        query += ' AND m = ?';
        params.push(m);
    }
    if (n !== -1) {
        query += ' AND n = ?';
        params.push(n);
    }
    if (k !== -1) {
        query += ' AND k = ?';
        params.push(k);
    }

    query += ` ORDER BY ${varyingDim} ASC`;

    const rows = queryDatabase(query, params);
    return { rows, varyingDim };
}

function queryOverviewPlot(git, machine, threads, dt, m, n, k) {
    let query = 'SELECT op, gflops FROM run WHERE git = ?';
    const params = [git];

    if (machine !== -1) {
        query += ' AND machine = ?';
        params.push(machine);
    }
    if (dt !== -1) {
        query += ' AND dt = ?';
        params.push(dt);
    }
    if (threads !== -1) {
        query += ' AND threads = ?';
        params.push(threads);
    }
    if (m !== -1) {
        query += ' AND (m = ? OR m = -1)';
        params.push(m);
    }
    if (n !== -1) {
        query += ' AND (n = ? OR n = -1)';
        params.push(n);
    }
    if (k !== -1) {
        query += ' AND (k = ? OR k = -1)';
        params.push(k);
    }

    query += ' ORDER BY op ASC';

    return queryDatabase(query, params);
}

// Machine Overview Query Functions
function getLatestGitCommit() {
    const query = 'SELECT DISTINCT git FROM run ORDER BY timestamp DESC LIMIT 1';
    const result = queryDatabase(query);
    return result.length > 0 ? result[0].git : null;
}

function getMaxThreads() {
    const query = 'SELECT MAX(threads) as max_threads FROM run';
    const result = queryDatabase(query);
    return result.length > 0 ? result[0].max_threads : -1;
}

function getAllMachines() {
    const query = 'SELECT DISTINCT machine FROM run ORDER BY machine ASC';
    return queryDatabase(query);
}

function getMachineOverviewData(git, maxThreads, machine) {
    let query = `
        SELECT op, MAX(gflops) as gflops
        FROM run
        WHERE git = ? AND threads = ? AND machine = ?
        GROUP BY op
        ORDER BY op ASC
    `;
    const params = [git, maxThreads, machine];
    return queryDatabase(query, params);
}

function getMachineHistoricalData(machine) {
    const query = `
        SELECT DISTINCT op, threads, dt, git, timestamp, gflops
        FROM run
        WHERE machine = ?
        ORDER BY op ASC, threads DESC, dt ASC, timestamp DESC
    `;
    return queryDatabase(query, [machine]);
}

// Machine Overview Rendering
function loadMachineOverview() {
    try {
        if (!db) {
            showError('Database not loaded');
            return;
        }

        showLoading();

        const latestGit = getLatestGitCommit();
        const maxThreads = getMaxThreads();
        const machines = getAllMachines();

        if (!latestGit || maxThreads === -1) {
            showError('No data available');
            clearLoading();
            return;
        }

        const machineCards = machines.map(m => {
            const machine = m.machine;
            const overviewData = getMachineOverviewData(latestGit, maxThreads, machine);

            const maxPerf = overviewData.length > 0
                ? Math.max(...overviewData.map(d => d.gflops))
                : 0;

            const opsCount = overviewData.length;

            return {
                machine,
                maxPerf,
                opsCount,
                opsList: overviewData.map(d => d.op).join(', '),
                maxThreads,
                latestGit: latestGit.substring(0, 8)
            };
        });

        renderMachineOverview(machineCards);
        clearLoading();

        // Show overview view
        switchViewToOverview();
    } catch (error) {
        showError(`Error loading overview: ${error.message}`);
        clearLoading();
    }
}

function renderMachineOverview(machineCards) {
    const grid = document.getElementById('machines-grid');
    grid.innerHTML = '';

    machineCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'machine-card';
        cardEl.innerHTML = `
            <div class="machine-name">${card.machine}</div>
            <div class="machine-stats">
                <div class="stat-row">
                    <span class="stat-label">Threads:</span>
                    <span class="stat-value">${card.maxThreads}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Operations:</span>
                    <span class="stat-value">${card.opsCount}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Git:</span>
                    <span class="stat-value">${card.latestGit}...</span>
                </div>
            </div>
            <div class="machine-performance">
                Max Performance: ${card.maxPerf.toFixed(2)} GFLOP/s
            </div>
        `;
        cardEl.onclick = () => loadMachineDetail(card.machine);
        grid.appendChild(cardEl);
    });
}

function switchViewToOverview() {
    const overviewView = document.getElementById('overview-view');
    const detailView = document.getElementById('detail-view');

    overviewView.classList.add('active');
    detailView.classList.remove('active');
    currentView = 'overview';
}

// Machine Detail View
function loadMachineDetail(machine) {
    try {
        currentMachine = machine;
        showLoading();

        const historicalData = getMachineHistoricalData(machine);

        if (historicalData.length === 0) {
            showError('No historical data available for this machine');
            clearLoading();
            return;
        }

        renderMachineDetail(machine, historicalData);
        clearLoading();

        // Switch to detail view
        switchViewToDetail();
    } catch (error) {
        showError(`Error loading machine detail: ${error.message}`);
        clearLoading();
    }
}

function renderMachineDetail(machine, historicalData) {
    // Set header info
    document.getElementById('detail-machine-name').textContent = `${machine} - Historical Data`;
    document.getElementById('detail-machine-info').textContent =
        `Showing performance history across all operations, thread counts, and data types`;

    // Group data by operation
    const groupedByOp = {};
    historicalData.forEach(row => {
        if (!groupedByOp[row.op]) {
            groupedByOp[row.op] = [];
        }
        groupedByOp[row.op].push(row);
    });

    const container = document.getElementById('historical-data-container');
    container.innerHTML = '';

    Object.keys(groupedByOp).sort().forEach(op => {
        const opData = groupedByOp[op];

        // Group by threads
        const groupedByThreads = {};
        opData.forEach(row => {
            const key = `${row.threads} threads`;
            if (!groupedByThreads[key]) {
                groupedByThreads[key] = [];
            }
            groupedByThreads[key].push(row);
        });

        const opElement = document.createElement('div');
        opElement.className = 'historical-operation-group';

        const headerEl = document.createElement('div');
        headerEl.className = 'operation-header';
        headerEl.innerHTML = `
            <span>${op}</span>
            <span class="expand-icon">▼</span>
        `;

        const contentEl = document.createElement('div');
        contentEl.className = 'operation-content';

        // Build content with threads and data types
        let contentHTML = '';
        Object.keys(groupedByThreads).sort((a, b) => {
            const aThreads = parseInt(a.split(' ')[0]);
            const bThreads = parseInt(b.split(' ')[0]);
            return bThreads - aThreads; // Descending
        }).forEach(threadKey => {
            const threadData = groupedByThreads[threadKey];

            // Group by data type
            const groupedByDT = {};
            threadData.forEach(row => {
                if (!groupedByDT[row.dt]) {
                    groupedByDT[row.dt] = row.gflops;
                } else {
                    groupedByDT[row.dt] = Math.max(groupedByDT[row.dt], row.gflops);
                }
            });

            contentHTML += `<div class="thread-data-group">
                <div class="thread-label">${threadKey}</div>`;

            Object.keys(groupedByDT).sort().forEach(dt => {
                contentHTML += `
                    <div class="dt-row">
                        <span class="dt-label">${dt}</span>
                        <span class="dt-value">${groupedByDT[dt].toFixed(2)} GFLOP/s</span>
                    </div>
                `;
            });

            contentHTML += '</div>';
        });

        contentEl.innerHTML = contentHTML;

        // Toggle expand/collapse
        headerEl.onclick = () => {
            contentEl.classList.toggle('expanded');
            headerEl.querySelector('.expand-icon').classList.toggle('expanded');
        };

        opElement.appendChild(headerEl);
        opElement.appendChild(contentEl);
        container.appendChild(opElement);
    });
}

function switchViewToDetail() {
    const overviewView = document.getElementById('overview-view');
    const detailView = document.getElementById('detail-view');

    overviewView.classList.remove('active');
    detailView.classList.add('active');
    currentView = 'detail';
}

// Charting Functions
function renderChart(data) {
    const ctx = document.getElementById('chart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    const chartConfig = {
        type: data.chart.type,
        data: {
            labels: data.chart.labels,
            datasets: data.chart.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 10
                    },
                    title: {
                        display: true,
                        text: 'Performance (GFLOP/s)'
                    }
                }
            }
        }
    };

    if (data.chart.type === 'line') {
        chartConfig.options.scales.y.grid = {
            drawBorder: true,
            color: 'rgba(0, 0, 0, 0.1)',
            lineWidth: 1
        };
    }

    chartInstance = new Chart(ctx, chartConfig);
}

// Main Plot Generation Function
function generatePlot() {
    try {
        clearMessages();

        if (!db) {
            showError('Please load a database first');
            return;
        }

        showLoading();

        const plotType = document.getElementById('plot-type').value;
        const machine = getParam('machine');
        const dt = getParam('dt');
        const threads = getParam('threads');
        const m = getParam('m');
        const n = getParam('n');
        const k = getParam('k');

        const result = {
            type: plotType,
            params: { machine, dt, threads, m, n, k }
        };

        let rows;

        if (plotType === 'historical') {
            const tag = getParam('tag');
            const op = getParam('op');

            if (!tag || tag === -1) {
                throw new Error('Tag is required for Historical plots');
            }
            if (!op || op === -1) {
                throw new Error('Operation is required for Historical plots');
            }

            result.params.tag = tag;
            result.params.op = op;

            rows = queryHistoricalPlot(machine, op, dt, threads, tag, m, n, k);

            // Group by date and keep max gflops for each date
            const dataByDate = {};
            rows.forEach(row => {
                const date = new Date(row.timestamp).toISOString().split('T')[0];
                if (!dataByDate[date]) {
                    dataByDate[date] = row.gflops;
                } else {
                    dataByDate[date] = Math.max(dataByDate[date], row.gflops);
                }
            });

            const labels = Object.keys(dataByDate);
            const data = labels.map(date => dataByDate[date]);

            result.chart = {
                type: 'line',
                labels,
                datasets: [{
                    label: 'Performance (GFLOP/s)',
                    data,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }]
            };

        } else if (plotType === 'scaling') {
            const git = getParam('git-scaling');
            const op = getParam('op-scaling');

            if (!git || git === -1) {
                throw new Error('Git commit is required for Scaling plots');
            }
            if (!op || op === -1) {
                throw new Error('Operation is required for Scaling plots');
            }

            result.params.git = git;
            result.params.op = op;

            const { rows: scalingRows, varyingDim } = queryScalingPlot(git, machine, op, dt, threads, m, n, k);

            const dataByDim = {};
            scalingRows.forEach(row => {
                const dimValue = row[varyingDim];
                if (!dataByDim[dimValue]) dataByDim[dimValue] = [];
                dataByDim[dimValue].push(row.gflops);
            });

            const labels = Object.keys(dataByDim).map(Number).sort((a, b) => a - b);
            const data = labels.map(label => {
                const values = dataByDim[label];
                return Math.max(...values);
            });

            result.chart = {
                type: 'line',
                labels: labels.map(String),
                datasets: [{
                    label: `Performance vs ${varyingDim.toUpperCase()} (GFLOP/s)`,
                    data,
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    tension: 0.1
                }]
            };

        } else if (plotType === 'overview') {
            const git = getParam('git-overview');

            if (!git || git === -1) {
                throw new Error('Git commit is required for Overview plots');
            }
            if (m === -1 || n === -1 || k === -1) {
                throw new Error('M, N, and K must all be specified for Overview plots');
            }

            result.params.git = git;

            rows = queryOverviewPlot(git, machine, threads, dt, m, n, k);

            const dataByOp = {};
            rows.forEach(row => {
                if (!dataByOp[row.op]) dataByOp[row.op] = [];
                dataByOp[row.op].push(row.gflops);
            });

            const labels = Object.keys(dataByOp).sort();
            const data = labels.map(label => {
                const values = dataByOp[label];
                return Math.max(...values);
            });

            const colors = [
                'rgb(255, 99, 132)',
                'rgb(54, 162, 235)',
                'rgb(255, 206, 86)',
                'rgb(75, 192, 192)',
                'rgb(153, 102, 255)',
                'rgb(255, 159, 64)'
            ];

            result.chart = {
                type: 'bar',
                labels,
                datasets: [{
                    label: 'Performance (GFLOP/s)',
                    data,
                    backgroundColor: colors.slice(0, labels.length)
                }]
            };
        }

        if (!result.chart.labels || result.chart.labels.length === 0) {
            throw new Error('No data found matching the specified criteria');
        }

        showParams(result.params, result.type);
        clearLoading();
        renderChart(result);

    } catch (error) {
        showError(`Error: ${error.message}`);
        clearLoading();
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Auto-load the perf.sqlite database on page load
    autoLoadDatabase();

    // Allow Enter to generate plot
    document.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && event.target.closest('.control-panel')) {
            generatePlot();
        }
    });
});
