require('dotenv').config();
const express = require('express');
const PlayFabAdmin = require('playfab-sdk/Scripts/PlayFab/PlayFabAdmin.js');
const cors = require('cors');
const app = express();

console.log('Starting server...');
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

PlayFabAdmin.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabAdmin.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

app.get('/', (req, res) => {
  res.send('MetroState API');
});

app.post('/api/redeem-promo', async (req, res) => {
  const { playFabId, serverId, code } = req.body;
  if (!playFabId || !serverId || !code) {
    console.error('Missing fields:', req.body);
    return res.status(400).json({ error: 'Missing playFabId, serverId, or code' });
  }
  try {
    const character = await getCharacter(playFabId, serverId);
    if (!character) {
      console.error('Character not found:', { playFabId, serverId });
      return res.status(400).json({ error: 'Character not found' });
    }
    const promoData = await getPromoCodes();
    const promo = promoData.codes[code.toUpperCase()];
    if (!promo) {
      console.error('Invalid code:', code);
      return res.status(400).json({ error: 'Invalid code' });
    }
    const redemptionKey = `promo_${code}_${serverId}`;
    const playerData = await getPlayerData(playFabId, [redemptionKey]);
    if (playerData[redemptionKey]) {
      console.error('Code already redeemed:', { playFabId, code, serverId });
      return res.status(400).json({ error: 'Code already redeemed' });
    }
    character.inventory = character.inventory || [];
    for (const [currency, amount] of Object.entries(promo.rewards.currencies)) {
      if (amount > 0) {
        await addCurrency(playFabId, currency, amount);
        character[currency.toLowerCase()] = (character[currency.toLowerCase()] || 0) + amount;
      }
    }
    for (const item of promo.rewards.items) {
      if (item.quantity > 0) {
        await grantItem(playFabId, item.itemId);
        const itemIndex = character.inventory.findIndex(i => i.itemId === item.itemId);
        if (itemIndex >= 0) {
          character.inventory[itemIndex].quantity += item.quantity;
        } else {
          character.inventory.push({ itemId: item.itemId, quantity: item.quantity });
        }
      }
    }
    await updateCharacter(playFabId, serverId, character);
    await setPlayerData(playFabId, { [redemptionKey]: 'redeemed' });
    console.log('Promo redeemed:', { playFabId, code, serverId });
    res.json({ status: 'success', rewards: promo.rewards });
  } catch (err) {
    console.error('Promo error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/purchase-item', async (req, res) => {
  const { playFabId, serverId, itemId } = req.body;
  try {
    const character = await getCharacter(playFabId, serverId);
    if (!character) return res.status(400).json({ error: 'Character not found' });
    const catalog = await getCatalog();
    const item = catalog.find(i => i.ItemId === itemId);
    if (!item) return res.status(400).json({ error: 'Item not found' });
    const priceMC = item.VirtualCurrencyPrices?.MC || 0;
    const priceMB = item.VirtualCurrencyPrices?.MB || 0;
    if (character.metrocoins < priceMC || character.metrobucks < priceMB) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }
    if (priceMC > 0) await subtractCurrency(playFabId, 'MC', priceMC);
    if (priceMB > 0) await subtractCurrency(playFabId, 'MB', priceMB);
    await grantItem(playFabId, itemId);
    character.metrocoins -= priceMC;
    character.metrobucks -= priceMB;
    const itemIndex = character.inventory.findIndex(i => i.itemId === itemId);
    if (itemIndex >= 0) {
      character.inventory[itemIndex].quantity += 1;
    } else {
      character.inventory.push({ itemId, quantity: 1 });
    }
    await updateCharacter(playFabId, serverId, character);
    res.json({ status: 'success', itemId });
  } catch (err) {
    console.error('Purchase error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/open-crate', async (req, res) => {
  const { playFabId, serverId, crateId } = req.body;
  try {
    const character = await getCharacter(playFabId, serverId);
    if (!character) return res.status(400).json({ error: 'Character not found' });
    const crates = await getCrates();
    const crate = crates[crateId];
    if (!crate) return res.status(400).json({ error: 'Crate not found' });
    if (character.metrocoins < crate.priceMetroCoins) {
      return res.status(400).json({ error: 'Insufficient MetroCoins' });
    }
    await subtractCurrency(playFabId, 'MC', crate.priceMetroCoins);
    const rewards = [];
    for (const reward of crate.rewards) {
      if (reward.type === 'item') {
        await grantItem(playFabId, reward.id);
        const itemIndex = character.inventory.findIndex(i => i.itemId === reward.id);
        if (itemIndex >= 0) {
          character.inventory[itemIndex].quantity += reward.quantity;
        } else {
          character.inventory.push({ itemId: reward.id, quantity: reward.quantity });
        }
        rewards.push({ type: 'item', id: reward.id, quantity: reward.quantity });
      }
    }
    character.metrocoins -= crate.priceMetroCoins;
    await updateCharacter(playFabId, serverId, character);
    res.json({ status: 'success', rewards });
  } catch (err) {
    console.error('Crate error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/open-daily-crate', async (req, res) => {
  const { playFabId, serverId } = req.body;
  try {
    const character = await getCharacter(playFabId, serverId);
    if (!character) return res.status(400).json({ error: 'Character not found' });
    const dailyCrate = await getDailyCrate();
    const lastClaimed = character.lastDailyCrate || 0;
    const now = Date.now();
    const cooldownMs = dailyCrate.cooldownHours * 3600000;
    if (lastClaimed && now - lastClaimed < cooldownMs) {
      return res.status(400).json({ error: 'Cooldown active' });
    }
    const reward = dailyCrate.rewards[Math.floor(Math.random() * dailyCrate.rewards.length)];
    if (reward.type === 'currency') {
      await addCurrency(playFabId, reward.id, reward.amount);
      character[reward.id.toLowerCase()] = (character[reward.id.toLowerCase()] || 0) + reward.amount;
    } else if (reward.type === 'item') {
      await grantItem(playFabId, reward.id);
      const itemIndex = character.inventory.findIndex(i => i.itemId === reward.id);
      if (itemIndex >= 0) {
        character.inventory[itemIndex].quantity += reward.quantity;
      } else {
        character.inventory.push({ itemId: reward.id, quantity: reward.quantity });
      }
    }
    character.lastDailyCrate = now;
    await updateCharacter(playFabId, serverId, character);
    res.json({ status: 'success', reward });
  } catch (err) {
    console.error('Daily crate error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-gang', async (req, res) => {
  const { playFabId, serverId, gangName } = req.body;
  try {
    const character = await getCharacter(playFabId, serverId);
    if (!character) return res.status(400).json({ error: 'Character not found' });
    if (character.gangId) return res.status(400).json({ error: 'Already in a gang' });
    const gangs = await getGangs();
    const serverGangs = gangs.servers[serverId] || [];
    if (serverGangs.find(g => g.name === gangName)) {
      return res.status(400).json({ error: 'Gang name taken' });
    }
    const gangId = `gang_${Date.now()}`;
    serverGangs.push({
      id: gangId,
      name: gangName,
      leader: playFabId,
      members: [playFabId]
    });
    gangs.servers[serverId] = serverGangs;
    await setTitleData('Gangs', JSON.stringify(gangs));
    character.gangId = gangId;
    await updateCharacter(playFabId, serverId, character);
    res.json({ status: 'success', gangId });
  } catch (err) {
    console.error('Gang error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin-action', async (req, res) => {
  const { playFabId, action, targetId, role } = req.body;
  try {
    const admin = await getPlayerData(playFabId, ['adminRole']);
    if (!admin.adminRole) return res.status(403).json({ error: 'Not authorized' });
    const roles = await getAdminRoles();
    const adminRole = roles.find(r => r.id === admin.adminRole);
    if (!adminRole.permissions.includes(action)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (action === 'assign_role' && adminRole.level < 4) {
      return res.status(403).json({ error: 'Only Community Manager can assign roles' });
    }
    if (action === 'kick_players' || action === 'ban_players') {
      return res.status(501).json({ error: 'Not implemented' });
    } else if (action === 'assign_role') {
      await setPlayerData(targetId, { adminRole: role });
    }
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function getCharacter(playFabId, serverId) {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        ObjectNames: [`character_${serverId}`]
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return result.data.Objects[`character_${serverId}`]?.DataObject;
  } catch (err) {
    console.error('GetCharacter error:', err);
    throw err;
  }
}

async function updateCharacter(playFabId, serverId, character) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.SetObjects({
        Entity: { Id: playFabId, Type: 'title_player_account' },
        Objects: [{ ObjectName: `character_${serverId}`, DataObject: character }]
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('UpdateCharacter error:', err);
    throw err;
  }
}

async function getCatalog() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetCatalogItems({
        CatalogVersion: 'Main'
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return result.data.Catalog;
  } catch (err) {
    console.error('GetCatalog error:', err);
    throw err;
  }
}

async function getCrates() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetTitleData({
        Keys: ['CratesTitleData']
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return JSON.parse(result.data.Data.CratesTitleData).Crates;
  } catch (err) {
    console.error('GetCrates error:', err);
    throw err;
  }
}

async function getDailyCrate() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetTitleData({
        Keys: ['DailyCrateData']
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return JSON.parse(result.data.Data.DailyCrateData).DailyCrate;
  } catch (err) {
    console.error('GetDailyCrate error:', err);
    throw err;
  }
}

async function getGangs() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetTitleData({
        Keys: ['Gangs']
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return JSON.parse(result.data.Data.Gangs);
  } catch (err) {
    console.error('GetGangs error:', err);
    throw err;
  }
}

async function getAdminRoles() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetTitleData({
        Keys: ['AdminRoles']
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return JSON.parse(result.data.Data.AdminRoles);
  } catch (err) {
    console.error('GetAdminRoles error:', err);
    throw err;
  }
}

async function getPlayerData(playFabId, keys) {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetPlayerData({
        PlayFabId,
        Keys: keys
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return result.data.Data;
  } catch (err) {
    console.error('GetPlayerData error:', err);
    throw err;
  }
}

async function getPromoCodes() {
  try {
    const result = await new Promise((resolve, reject) => {
      PlayFabAdmin.GetTitleData({
        Keys: ['promoCodes']
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    return JSON.parse(result.data.Data.promoCodes);
  } catch (err) {
    console.error('GetPromoCodes error:', err);
    throw err;
  }
}

async function addCurrency(playFabId, currency, amount) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.AddUserVirtualCurrency({
        PlayFabId,
        VirtualCurrency: currency,
        Amount: amount
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('AddCurrency error:', err);
    throw err;
  }
}

async function subtractCurrency(playFabId, currency, amount) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.SubtractUserVirtualCurrency({
        PlayFabId,
        VirtualCurrency: currency,
        Amount: amount
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('SubtractCurrency error:', err);
    throw err;
  }
}

async function grantItem(playFabId, itemId) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.GrantItemsToUser({
        PlayFabId,
        ItemIds: [itemId]
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('GrantItem error:', err);
    throw err;
  }
}

async function setPlayerData(playFabId, data) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.SetPlayerData({
        PlayFabId,
        Data: data
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('SetPlayerData error:', err);
    throw err;
  }
}

async function setTitleData(key, value) {
  try {
    await new Promise((resolve, reject) => {
      PlayFabAdmin.SetTitleData({
        Key: key,
        Value: value
      }, (error, result) => error ? reject(error) : resolve(result));
    });
  } catch (err) {
    console.error('SetTitleData error:', err);
    throw err;
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});