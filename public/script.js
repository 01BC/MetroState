PlayFab.settings.titleId = '115555';

function showAuth() {
    $('#auth-section').show();
    $('#dashboard, #admin-panel').hide();
}

function showDashboard() {
    $('#auth-section, #admin-panel').hide();
    $('#dashboard').show();
    loadDashboard();
}

function showAdminPanel() {
    $('#auth-section, #dashboard').hide();
    $('#admin-panel').show();
}

$('#signup-form').submit((e) => {
    e.preventDefault();
    const email = $('#signup-email').val();
    const password = $('#signup-password').val();
    const username = $('#signup-username').val();
    PlayFabClientSDK.RegisterPlayFabUser({
        Email: email,
        Password: password,
        Username: username,
        RequireBothUsernameAndEmail: true
    }, (result, error) => {
        if (error) {
            alert(`Signup error: ${error.errorMessage}`);
        } else {
            alert('Signup successful! Please log in.');
            $('#signup-form')[0].reset();
        }
    });
});

$('#login-form').submit((e) => {
    e.preventDefault();
    const email = $('#login-email').val();
    const password = $('#login-password').val();
    PlayFabClientSDK.LoginWithEmailAddress({
        Email: email,
        Password: password
    }, (result, error) => {
        if (error) {
            alert(`Login error: ${error.errorMessage}`);
        } else {
            localStorage.setItem('playFabId', result.data.PlayFabId);
            localStorage.setItem('sessionTicket', result.data.SessionTicket);
            localStorage.setItem('username', email.split('@')[0]);
            showDashboard();
        }
    });
});

$('#logout').click(() => {
    localStorage.removeItem('playFabId');
    localStorage.removeItem('sessionTicket');
    localStorage.removeItem('username');
    showAuth();
});

async function loadDashboard() {
    const playFabId = localStorage.getItem('playFabId');
    if (!playFabId) {
        showAuth();
        return;
    }

    $('#username').text(localStorage.getItem('username'));

    try {
        const titleData = await new Promise((resolve, reject) => {
            PlayFabClientSDK.GetTitleData({
                Keys: ['Servers', 'Jobs', 'Factions', 'CratesTitleData', 'AdminRoles']
            }, (result, error) => error ? reject(error) : resolve(result));
        });

        const serversData = JSON.parse(titleData.data.Data.Servers);
        const jobs = JSON.parse(titleData.data.Data.Jobs);
        const factions = JSON.parse(titleData.data.Data.Factions);
        const crates = JSON.parse(titleData.data.Data.CratesTitleData).Crates;
        const adminRoles = JSON.parse(titleData.data.Data.AdminRoles);

        const regionSelects = ['#region-select', '#inventory-region', '#promo-region', '#store-region', '#crate-region', '#daily-crate-region', '#gang-region'];
        const serverSelects = ['#server-select', '#inventory-server', '#promo-server', '#store-server', '#crate-server', '#daily-crate-server', '#gang-server'];

        regionSelects.forEach((sel, index) => {
            $(sel).html('<option value="">Select Region</option>');
            serversData.regions.forEach(region => {
                $(sel).append(`<option value="${region.id}">${region.name}</option>`);
            });

            $(sel).off('change').on('change', () => {
                const regionId = $(sel).val();
                const serverSel = serverSelects[index];
                $(serverSel).html('<option value="">Select Server</option>');
                if (regionId) {
                    const region = serversData.regions.find(r => r.id === regionId);
                    region.servers.forEach(server => {
                        $(serverSel).append(`<option value="${server.id}">${server.name}</option>`);
                    });
                }
            });
        });

        $('#character-job').html('<option value="">Select Job</option>');
        jobs.forEach(job => {
            $('#character-job').append(`<option value="${job.id}">${job.name}</option>`);
        });

        $('#character-faction').html('<option value="">Select Faction</option>');
        factions.forEach(faction => {
            $('#character-faction').append(`<option value="${faction.id}">${faction.name}</option>`);
        });

        $('#character-skin').html('<option value="">Select Skin</option>');
        for (let i = 1; i <= 30; i++) {
            $('#character-skin').append(`<option value="skin${i}">Skin ${i}</option>`);
        });

        const catalog = await new Promise((resolve, reject) => {
            PlayFabClientSDK.GetCatalogItems({ CatalogVersion: 'Main' }, (result, error) => error ? reject(error) : resolve(result));
        });
        $('#store-items').empty();
        catalog.data.Catalog.forEach(item => {
            $('#store-items').append(`
                <div class="card p-4">
                    <h5 class="text-lg font-medium">${item.DisplayName}</h5>
                    <p class="text-gray-600">MC: ${item.VirtualCurrencyPrices?.MC || 0}, MB: ${item.VirtualCurrencyPrices?.MB || 0}</p>
                    <button class="bg-black text-white px-4 py-2 rounded btn buy-item" data-item-id="${item.ItemId}">Buy</button>
                </div>
            `);
        });

        $('#crates').empty();
        Object.entries(crates).forEach(([id, crate]) => {
            $('#crates').append(`
                <div class="card p-4">
                    <h5 class="text-lg font-medium">${crate.ui.title}</h5>
                    <p class="text-gray-600">${crate.ui.description}</p>
                    <p class="text-gray-600">Cost: ${crate.priceMetroCoins} MC</p>
                    <button class="bg-black text-white px-4 py-2 rounded btn open-crate" data-crate-id="${id}">${crate.ui.buttonText}</button>
                </div>
            `);
        });

        const adminRole = await new Promise((resolve, reject) => {
            PlayFabClientSDK.GetPlayerData({ Keys: ['adminRole'] }, (result, error) => error ? reject(error) : resolve(result));
        });
        if (adminRole.data.Data.adminRole) {
            $('#admin-panel-btn').remove();
            $('#dashboard').prepend('<button id="admin-panel-btn" class="w-full bg-yellow-500 text-white p-2 rounded mb-6 btn">Admin Panel</button>');
        }

        const objects = await new Promise((resolve, reject) => {
            PlayFabClientSDK.GetObjects({
                Entity: { Id: playFabId, Type: 'title_player_account' },
                ObjectNames: ['character_us-medley', 'character_us-colma', 'character_mena-medley', 'character_mena-colma']
            }, (result, error) => error ? reject(error) : resolve(result));
        });

        const inventory = await new Promise((resolve, reject) => {
            PlayFabClientSDK.GetUserInventory({}, (result, error) => error ? reject(error) : resolve(result));
        });

        const tableBody = $('#characters-table');
        tableBody.empty();
        const servers = [
            { id: 'us-medley', name: 'Medley', region: 'US' },
            { id: 'us-colma', name: 'Colma', region: 'US' },
            { id: 'mena-medley', name: 'Medley', region: 'MENA' },
            { id: 'mena-colma', name: 'Colma', region: 'MENA' }
        ];
        servers.forEach(server => {
            const character = objects.data.Objects[`character_${server.id}`]?.DataObject || {};
            tableBody.append(`
                <tr class="bg-white">
                    <td class="border p-2">${server.region}</td>
                    <td class="border p-2">${server.name}</td>
                    <td class="border p-2">${character.name || 'None'}</td>
                    <td class="border p-2">${character.skin || 'None'}</td>
                    <td class="border p-2">${character.job || 'None'}</td>
                    <td class="border p-2">${character.faction || 'None'}</td>
                    <td class="border p-2">${character.metrocoins ?? 0}</td>
                    <td class="border p-2">${character.metrobucks ?? 0}</td>
                </tr>
            `);
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        alert('Error loading dashboard. Check console for details.');
    }
}

$('#create-character-form').submit((e) => {
    e.preventDefault();
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#server-select').val();
    const name = $('#character-name').val();
    const skin = $('#character-skin').val();
    const job = $('#character-job').val();
    const faction = $('#character-faction').val();
    if (!serverId || !name || !skin || !job || !faction) {
        alert('Please fill all fields.');
        return;
    }
    PlayFabClientSDK.GetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        ObjectNames: [`character_${serverId}`]
    }, (result, error) => {
        if (error) {
            console.error('GetObjects error:', error);
            alert(`Error checking character: ${error.errorMessage}`);
            return;
        }
        if (result.data.Objects[`character_${serverId}`]) {
            alert('Character already exists for this server!');
            return;
        }
        PlayFabClientSDK.SetObjects({
            Entity: { Id: playFabId, Type: 'title_player_account' },
            Objects: [{
                ObjectName: `character_${serverId}`,
                DataObject: {
                    name, skin, job, faction,
                    metrocoins: 100, metrobucks: 1000,
                    inventory: [],
                    lastDailyCrate: 0,
                    gangId: null
                }
            }]
        }, (result, error) => {
            if (error) {
                console.error('SetObjects error:', error);
                alert(`Error creating character: ${error.errorMessage}`);
            } else {
                alert('Character created!');
                $('#create-character-form')[0].reset();
                loadDashboard();
            }
        });
    });
});

$('#create-gang-form').submit((e) => {
    e.preventDefault();
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#gang-server').val();
    const gangName = $('#gang-name').val();
    if (!serverId || !gangName) {
        alert('Please select a server and enter a gang name.');
        return;
    }
    PlayFabClientSDK.GetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        ObjectNames: [`character_${serverId}`]
    }, (result, error) => {
        if (error || !result.data.Objects[`character_${serverId}`]) {
            console.error('GetObjects error:', error);
            alert('No character found for this server.');
            return;
        }
        fetch('/api/create-gang', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playFabId, serverId, gangName })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                console.error('Create gang error:', data.error);
                alert(`Error: ${data.error}`);
            } else {
                alert('Gang created!');
                $('#create-gang-form')[0].reset();
                loadDashboard();
            }
        })
        .catch(err => {
            console.error('Fetch error:', err);
            alert('Network error. Check console.');
        });
    });
});

$('#inventory-server').change((e) => {
    const serverId = e.target.value;
    const playFabId = localStorage.getItem('playFabId');
    const inventoryList = $('#inventory-list');
    inventoryList.empty();
    if (!serverId) return;
    PlayFabClientSDK.GetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        ObjectNames: [`character_${serverId}`]
    }, (result, error) => {
        if (error) {
            console.error('GetObjects error:', error);
            alert(`Error loading inventory: ${error.errorMessage}`);
            return;
        }
        if (!result.data.Objects[`character_${serverId}`]) {
            inventoryList.html('<li>No character found for this server.</li>');
            return;
        }
        const inventory = result.data.Objects[`character_${serverId}`].DataObject.inventory || [];
        inventory.forEach(item => {
            inventoryList.append(`<li>${item.itemId}: ${item.quantity}</li>`);
        });
    });
});

$('#promo-form').submit((e) => {
    e.preventDefault();
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#promo-server').val();
    const code = $('#promo-code').val();
    const promoResult = $('#promo-result');
    if (!serverId || !code) {
        promoResult.text('Please select a server and enter a code.');
        return;
    }
    PlayFabClientSDK.GetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        ObjectNames: [`character_${serverId}`]
    }, (result, error) => {
        if (error || !result.data.Objects[`character_${serverId}`]) {
            console.error('GetObjects error:', error);
            promoResult.text('Error: No character found.');
            return;
        }
        fetch('/api/redeem-promo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playFabId, serverId, code })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                console.error('Redeem promo error:', data.error);
                promoResult.text(`Error: ${data.error}`);
            } else {
                promoResult.text('Success! Rewards added.');
                loadDashboard();
            }
        })
        .catch(err => {
            console.error('Fetch error:', err);
            promoResult.text('Network error. Check console.');
        });
    });
});

$(document).on('click', '.buy-item', function() {
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#store-server').val();
    const itemId = $(this).data('item-id');
    if (!serverId) {
        alert('Select a server first!');
        return;
    }
    fetch('/api/purchase-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, serverId, itemId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error('Purchase error:', data.error);
            alert(`Error: ${data.error}`);
        } else {
            alert('Item purchased!');
            loadDashboard();
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        alert('Network error. Check console.');
    });
});

$(document).on('click', '.open-crate', function() {
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#crate-server').val();
    const crateId = $(this).data('crate-id');
    if (!serverId) {
        alert('Select a server first!');
        return;
    }
    fetch('/api/open-crate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, serverId, crateId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error('Open crate error:', data.error);
            alert(`Error: ${data.error}`);
        } else {
            alert('Crate opened! Rewards: ' + JSON.stringify(data.rewards));
            loadDashboard();
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        alert('Network error. Check console.');
    });
});

$('#open-daily-crate').click(() => {
    const playFabId = localStorage.getItem('playFabId');
    const serverId = $('#daily-crate-server').val();
    if (!serverId) {
        alert('Select a server first!');
        return;
    }
    fetch('/api/open-daily-crate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, serverId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error('Daily crate error:', data.error);
            $('#daily-crate-result').text(`Error: ${data.error}`);
        } else {
            $('#daily-crate-result').text('Success! Reward: ' + JSON.stringify(data.reward));
            loadDashboard();
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        $('#daily-crate-result').text('Network error. Check console.');
    });
});

$(document).on('click', '#admin-panel-btn', () => {
    showAdminPanel();
});

$('#back-to-dashboard').click(() => {
    showDashboard();
});

$('#admin-action-form').submit((e) => {
    e.preventDefault();
    const playFabId = localStorage.getItem('playFabId');
    const targetId = $('#target-id').val();
    const action = $('#admin-action').val();
    const role = $('#admin-role').val();
    if (!targetId || !action) {
        $('#admin-result').text('Please fill all fields.');
        return;
    }
    fetch('/api/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, action, targetId, role })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error('Admin action error:', data.error);
            $('#admin-result').text(`Error: ${data.error}`);
        } else {
            $('#admin-result').text('Action successful!');
        }
    })
    .catch(err => {
        console.error('Fetch error:', err);
        $('#admin-result').text('Network error. Check console.');
    });
});

$('#admin-action').change((e) => {
    if (e.target.value === 'assign_role') {
        $('#role-select').removeClass('hidden');
    } else {
        $('#role-select').addClass('hidden');
    }
});

if (localStorage.getItem('playFabId') && localStorage.getItem('sessionTicket')) {
    showDashboard();
} else {
    showAuth();
}