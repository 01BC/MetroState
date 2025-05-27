PlayFab.settings.titleId = '115555';

function showAuth() {
  $('#auth-section').show();
  $('#dashboard, #admin-panel').hide();
}

function showDashboard() {
  $('#auth-section, #admin-panel').hide();
  $('#dashboard').show();
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
      loadDashboard();
    }
  });
});

$('#logout').click(() => {
  localStorage.removeItem('playFabId');
  localStorage.removeItem('sessionTicket');
  localStorage.removeItem('username');
  showAuth();
});

function loadDashboard() {
  const playFabId = localStorage.getItem('playFabId');
  if (!playFabId) {
    showAuth();
    return;
  }

  $('#username').text(localStorage.getItem('username'));

  PlayFabClientSDK.GetTitleData({ Keys: ['Servers', 'Jobs', 'Factions', 'CratesTitleData', 'AdminRoles'] }, (result, error) => {
    if (error) {
      alert(`Error loading data: ${error.errorMessage}`);
      return;
    }

    const servers = JSON.parse(result.data.Data.Servers).servers;
    const jobs = JSON.parse(result.data.Data.Jobs);
    const factions = JSON.parse(result.data.Data.Factions);
    const crates = JSON.parse(result.data.Data.CratesTitleData).Crates;
    const adminRoles = JSON.parse(result.data.Data.AdminRoles);

    const serverSelects = ['#server-select', '#inventory-server', '#promo-server', '#store-server', '#crate-server', '#daily-crate-server', '#gang-server'];
    serverSelects.forEach(sel => {
      $(sel).html('<option value="">Select Server</option>');
      servers.forEach(server => {
        $(sel).append(`<option value="${server.id}">${server.name}</option>`);
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
    }

    $('#store-items').empty();
    PlayFabClientSDK.GetCatalogItems({ CatalogVersion: 'Main' }, (catResult, catError) => {
      if (!catError) {
        catResult.data.Catalog.forEach(item => {
          $('#store-items').append(`
            <div class="card-block p-3 mb-2">
              <h5>${item.DisplayName}</h5>
              <p>MC: ${item.VirtualCurrencyPrices?.MC || 0}, MB: ${item.VirtualCurrencyPrices?.MB || 0}</p>
              <button class="btn btn-primary buy-item" data-item-id="${item.ItemId}">Buy</button>
            </div>
          `);
        });
      }
    });

    $('#crates').empty();
    Object.entries(crates).forEach(([id, crate]) => {
      $('#crates').append(`
        <div class="card-block p-3 mb-2">
          <h5>${crate.ui.title}</h5>
          <p>${crate.ui.description}</p>
          <p>Cost: ${crate.priceMetroCoins} MC</p>
          <button class="btn btn-primary open-crate" data-crate-id="${id}">${crate.ui.buttonText}</button>
        </div>
      `);
    });

    PlayFabClientSDK.GetPlayerData({ Keys: ['adminRole'] }, (roleResult, roleError) => {
      if (!roleError && roleResult.data.Data.adminRole) {
        $('#dashboard').prepend('<button id="admin-panel-btn" class="btn btn-warning btn-block mb-4">Admin Panel</button>');
      }
    });
  });

  PlayFabClientSDK.GetObjects({
    Entity: { Id: playFabId, Type: 'PlayFabId' },
    ObjectNames: ['character_medley', 'character_colma']
  }, (result, error) => {
    if (error) {
      alert(`Error loading characters: ${error.errorMessage}`);
      return;
    }

    PlayFabClientSDK.GetUserInventory({}, (invResult, invError) => {
      if (invError) {
        alert(`Error loading inventory: ${invError.errorMessage}`);
        return;
      }

      const tableBody = $('#characters-table tbody');
      tableBody.empty();
      const servers = [{ id: 'medley', name: 'Medley' }, { id: 'colma', name: 'Colma' }];
      servers.forEach(server => {
        const character = result.data.Objects[`character_${server.id}`]?.DataObject || {};
        tableBody.append(`
          <tr>
            <td>${server.name}</td>
            <td>${character.name || 'None'}</td>
            <td>${character.skin || 'None'}</td>
            <td>${character.job || 'None'}</td>
            <td>${character.faction || 'None'}</td>
            <td>${character.metrocoins || 0}</td>
            <td>${character.metrobucks || 0}</td>
          </tr>
        `);
      });
    });
  });
}

$('#create-character-form').submit((e) => {
  e.preventDefault();
  const playFabId = localStorage.getItem('playFabId');
  const serverId = $('#server-select').val();
  const name = $('#character-name').val();
  const skin = $('#character-skin').val();
  const job = $('#character-job').val();
  const faction = $('#character-faction').val();

  PlayFabClientSDK.GetObjects({
    Entity: { Id: playFabId, Type: 'PlayFabId' },
    ObjectNames: [`character_${serverId}`]
  }, (result, error) => {
    if (error) {
      alert(`Error checking character: ${error.errorMessage}`);
      return;
    }

    if (result.data.Objects[`character_${serverId}`]) {
      alert('Character already exists for this server!');
      return;
    }

    PlayFabClientSDK.SetObjects({
      Entity: { Id: playFabId, Type: 'playFabId' },
      Objects: [{
        ObjectName: `character_${serverId}`,
        DataObject: {
          name, skin, serverId, job, faction,
          metrocoins: 100, metrobucks: 1000,
          items: [],
          inventory: [],
          gangId: null
        }
      }]
    }, (result, error) => {
      if (error) {
        alert(`Error creating character: ${error.errorMessage}`);
      } else {
        alert('Character created!');
        $('#create-character-form')[0].reset();
        loadDashboard();
      }
    });
  });
});

$('#create-gang').click((e) => {
  e.preventDefault();
  const playFabId = localStorage.getItem('playFabId');
  const serverId = $('#gang-server').val();
  const gangName = $('#gang-name').val();

  PlayFabClientSDK.GetObjects({
    Entity: { Id: playFabId, Type: 'PlayFabId' },
    ObjectNames: [`character_${serverId}`]
  }, (result, error) => {
    if (error || !result.data.Objects[`character_${serverId}`]) {
      alert('No character found for this server.');
      return;
    }

    fetch('/api/gang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playFabId, serverId, gangName })
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert('Gang created!');
        $('#create-gang-form')[0].reset();
      }
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
    Entity: { Id: playFabId, Type: 'PlayFabId' },
    ObjectNames: [`character_${serverId}`]
  }, (result, error) => {
    if (error) {
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

  PlayFabClientSDK.GetObjects({
    Entity: { Id: playFabId, Type: 'PlayFabId' },
    ObjectNames: [`character_${serverId}`]
  }, (result, error) => {
    if (error || !result.data.Objects[`character_${serverId}`]) {
      promoResult.text('Error: No character found.');
      return;
    }

    fetch('/api/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playFabId, serverId, code })
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        promoResult.text(`Error: ${data.error}`);
      } else {
        promoResult.text('Success! Rewards added.');
        loadDashboard();
      }
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

  fetch('/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playFabId, serverId, itemId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      alert(`Error: ${data.error}`);
    } else {
      alert('Item purchased!');
      loadDashboard();
    }
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

  fetch('/api/crate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playFabId, serverId, crateId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      alert(`Error: ${data.error}`);
    } else {
      alert('Crate opened! Rewards: ' + JSON.stringify(data.rewards));
      loadDashboard();
    }
  });
});

$('#open-daily-crate').click(() => {
  const playFabId = localStorage.getItem('playFabId');
  const serverId = $('#daily-crate-server').val();

  if (!serverId) {
    alert('Select a server first!');
    return;
  }

  fetch('/api/daily-crate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playFabId, serverId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      $('#daily-crate-result').text(`Error: ${data.error}`);
    } else {
      $('#daily-crate-result').text('Success! Reward: ' + JSON.stringify(data.reward));
      loadDashboard();
    }
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

  fetch('/api/admin-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playFabId, action, targetId, role })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      $('#admin-result').text(`Error: ${data.error}`);
    } else {
      $('#admin-result').text('Action successful!');
    }
  });
});

$('#admin-action').change((e) => {
  if (e.target.value === 'assign_role') {
    $('#role-select').show();
  } else {
    $('#role-select').hide();
  }
});

if (localStorage.getItem('playFabId') && localStorage.getItem('sessionTicket')) {
  showDashboard();
  loadDashboard();
} else {
  showAuth();
}