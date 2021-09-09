console.log('Service worker executed');

import './xmlhttprequest';
import { createClient } from '@supabase/supabase-js';
import { decode } from 'html-entities';
import ChromeLocalStorage from './storage';
const NEXT_PUBLIC_SUPABASE_URL = "https://wdvnygveftqzaekowelk.supabase.co"
const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMDc2ODQ2MCwiZXhwIjoxOTQ2MzQ0NDYwfQ.FcYHzQjhQK9HZrpX6asv0bdcMBcuKtcLUBBFs19-3d8"
let client;

chrome.runtime.onInstalled.addListener(() => {
  initialize();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name != 'fetch') return;

  if (client) return fetchData();
  initialize();
});

async function initialize() {
  await ChromeLocalStorage.preLoad();
  console.log('Initializing client');

  client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    localStorage: new ChromeLocalStorage(),
    detectSessionInUrl: false,
  });

  const currentUser = client.auth.user();
  if (!currentUser) return off();

  chrome.action.setBadgeBackgroundColor({ color: '#CC0000' });
  fetchData();
}

// ---- popup message handling
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  switch (request.action) {
    case 'open':
      if (!client) await initialize();
      const user = await logIn();
      chrome.runtime.sendMessage({ action: "auth", payload: user });

      fetchData();
      break;

    case 'findLead':
      onFindLead(request.payload);
      break;
    case 'connect':
      onConnect(request);
      break;
    case 'match':
      onMatch(request);
      break;
    case 'discard':
      onDiscard(request);
      break;
  }

  sendResponse();
});

function chromeAlarm(action, name) {
  return new Promise(resolve => {
    chrome.alarms[action](name, alarm => {
      // console.log(`${action} alarm "${name}" done`);
      resolve(alarm);
    });
  });
}

async function fetchData() {
  console.log('fetchData', new Date(), client.auth.user());

  await chromeAlarm("clear", "fetch");

  const { data, error } = await client
    .from('leads')
    .select()
    .filter('status', 'eq', 'queued')

  if (error) {
    console.log(error);
    return
  }

  console.log(`Found ${data.length} leads`);

  const queued = data.filter(lead => lead.status == 'queued');
  chrome.action.setBadgeText({ text: `${queued.length}` });

  chrome.runtime.sendMessage({ action: "leads", payload: data });

  chrome.alarms.create("fetch", { delayInMinutes: 0.5 });
}

async function logIn() {
  const currentUser = client.auth.user();

  if (currentUser) {
    // console.log('user already present', currentUser);
    return currentUser;
  }

  const { user, session, error } = await client.auth.signIn({
    email: 'joserobleda@gmail.com',
    password: '123456',
  })

  return user;
}

function off() {
  chrome.action.setBadgeBackgroundColor({ color: '#CCCCCC' });
  chrome.action.setBadgeText({ text: `OFF` });
};

// --------------- linkedin methods

async function onFindLead(lead) {
  const email = lead.email;
  const org = lead.org || /@(\w+)/gi.exec(email)[1];;
  const domain = email.split('@')[1];
  let name = lead.name || email.split('@')[0];

  if (name.indexOf(' ') !== -1) {
    name = name.substring(0, name.indexOf(' '));
  }

  const company = await findOrg(org);
  const profiles = await findProfilesInCompany(company, name);

  // chrome.runtime.sendMessage({ action: "profile", payload: user });
  chrome.runtime.sendMessage({
    action: "profiles", payload: {
      lead,
      profiles
    }
  });
}

async function onDiscard(request) {
  const lead = request.payload;

  const { data, error } = await client
    .from('leads')
    .update({ status: 'discard' })
    .match({ id: lead.id });

  fetchData();
}

async function onMatch(request) {
  const { lead, profile } = request.payload;

  const { data, error } = await client
    .from('leads')
    .update({
      profile_url: profile.url,
      company_url: profile.company.navigationUrl,
      status: 'match',
    })
    .match({ id: lead.id });

  fetchData();
}

async function onConnect(request) {
  const { lead, profile } = request.payload;

  await sendConnectionRequest(profile);

  onFindLead(lead)
}

async function sendConnectionRequest(profile) {
  const url = `https://www.linkedin.com/voyager/api/growth/normInvitations?action=verifyQuotaAndCreate`;
  const payload = {
    invitation: {
      emberEntityName: "growth/invitation/norm-invitation",
      invitee: {
        'com.linkedin.voyager.growth.invitation.InviteeProfile': {
          profileId: profile.hit.id
        },
      },
      trackingId: profile.trackingId,
    }
  };

  console.log("post", payload);
  return await postLinked(url, payload);
}

async function findOrg(orgName) {
  const objects = await getLinkedInObjects(`https://www.linkedin.com/search/results/companies/?keywords=${orgName}`);

  const collection = objects.filter(o => o.data && o.data.$type == 'com.linkedin.restli.common.CollectionResponse' && o.included && o.included.length)[0];

  const ids = collection.data.elements.reduce((carry, view) => {
    return carry.concat(view['*results'] || []);
  }, []).map(result => result.match(/(\d+)/)[0]);

  const models = ids.map(id => {
    let model = collection.included.filter(model => model.trackingUrn == `urn:li:company:${id}`)[0]
    model.id = id;
    return model;
  });

  return models[0];
}

async function findProfilesInCompany(company, name) {
  // const peopleSearchPage = `${company.navigationUrl}people/?keywords=${name}`;
  const url = `https://www.linkedin.com/voyager/api/search/hits?count=12&educationEndYear=List()&educationStartYear=List()&facetCurrentCompany=List(${company.id})&facetCurrentFunction=List()&facetFieldOfStudy=List()&facetGeoRegion=List()&facetNetwork=List()&facetSchool=List()&facetSkillExplicit=List()&keywords=List(${name})&maxFacetValues=15&origin=organization&q=people&start=0&supportedFacets=List(GEO_REGION,SCHOOL,CURRENT_COMPANY,CURRENT_FUNCTION,FIELD_OF_STUDY,SKILL_EXPLICIT,NETWORK)`;
  const stream = await fetchLinkedIn(url, true);
  const response = await stream.json();
  const invites = await fetchSentInvites()

  const models = response.data.elements.map(element => {
    const model = response.included.find(model => model.trackingId == element.trackingId);
    const invite = invites.find(invite => invite.toMemberId === element.hitInfo.id);

    return {
      ...model,
      hit: element.hitInfo,
      invite,
      url: `https://www.linkedin.com/in/${model.publicIdentifier}/`,
      company,
    }
  });

  return models;
}

async function fetchSentInvites() {
  const stream = await fetchLinkedIn(`https://www.linkedin.com/voyager/api/relationships/sentInvitationViewsV2?count=100&invitationType=CONNECTION&q=invitationType&start=0`, true);
  const response = await stream.json();

  const invites = response.included.filter(invite => invite.$type == 'com.linkedin.voyager.relationships.invitation.Invitation');
  return invites;
}

async function getLinkedInObjects(url) {
  const stream = await fetchLinkedIn(url);
  const response = await stream.text();

  const objects = [];
  const regex = /<code[^>]*>([\s\S]*?)(?:<\/code>)/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    const content = match[1].trim();
    const jsonString = decode(content);
    try {
      const data = JSON.parse(jsonString);
      objects.push(data);
    } catch (e) {
      // some <code> blocks contain non-json 
    }
  }

  return objects;
}

async function fetchLinkedIn(url, json = false) {
  const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com/', name: 'li_at' });
  const csrf = await chrome.cookies.get({ url: 'https://www.linkedin.com/', name: 'JSESSIONID' });
  let headers = {
    'Cookie': `li_at=${cookie.value}`,
    'x-restli-protocol-version': '2.0.0',
    'csrf-token': csrf.value.substring(1, csrf.value.length - 1),
  };

  if (json) {
    headers['accept'] = 'application/vnd.linkedin.normalized+json+2.1';
  }

  return await fetch(url, {
    method: 'GET',
    headers,
    mode: 'cors',
    cache: 'default',
  });
}

async function postLinked(endpoint, data) {
  const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com/', name: 'li_at' });
  const csrf = await chrome.cookies.get({ url: 'https://www.linkedin.com/', name: 'JSESSIONID' });
  let headers = {
    'Cookie': `li_at=${cookie.value}`,
    'x-restli-protocol-version': '2.0.0',
    'csrf-token': csrf.value.substring(1, csrf.value.length - 1),
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'Content-Type': 'application/json',
  };

  return await fetch(endpoint, {
    method: 'POST',
    headers,
    mode: 'cors',
    cache: 'default',
    body: JSON.stringify(data)
  });
}

async function getLinkedInPrimaryEmail() {
  const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com/', name: 'li_at' });

  const stream = await fetch('https://www.linkedin.com/psettings/email?asJson=true', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `li_at = ${cookie.value}`,
    },
    mode: 'cors',
    cache: 'default',
  });

  const response = await stream.json();
  const primary = response.map.data.filter(account => account.isPrimary)[0];

  return primary.email;
}