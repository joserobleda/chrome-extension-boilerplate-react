console.log('service worker executed', (new Date()).toISOString());

const WEB = 'https://nurturein.vercel.app';
import './xmlhttprequest';
import { createClient } from '@supabase/supabase-js';
import { decode } from 'html-entities';
import ChromeLocalStorage from './storage';
const NEXT_PUBLIC_SUPABASE_URL = "https://wdvnygveftqzaekowelk.supabase.co"
const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMDc2ODQ2MCwiZXhwIjoxOTQ2MzQ0NDYwfQ.FcYHzQjhQK9HZrpX6asv0bdcMBcuKtcLUBBFs19-3d8"
let client;

async function initialize() {
  await ChromeLocalStorage.preLoad();
  console.log('initializing client', (new Date()).toISOString());

  const localStorage = new ChromeLocalStorage();
  client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    localStorage,
    detectSessionInUrl: false,
  });

  client.auth.onAuthStateChange((event, session) => {
    console.log(event, session)

    if ('SIGNED_IN' == event) {
      fetchLinkedInProfileInfo(localStorage);
    }
  });

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      console.log('trying to recover session on initialize...')
      const { data: { session }, error } = await client.auth.getSession();

      if (error) throw error;
      if (session) {
        await client.auth.setSession(session);
      }
    }
  } catch (error) {
    console.error('Error recovering session:', error);
    return off('!');
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session) return off('!');

  chrome.alarms.get('fetch', a => {
    if (a) return;

    chrome.alarms.create('fetch', { periodInMinutes: 1 });
    console.log(`alarm setup`, (new Date()).toISOString());
  });

  fetchData(`initialize`);
}

async function fetchLinkedInProfileInfo() {
  console.log('✅ FETCH LINKEDIN INFO');

  const objects = await getLinkedInObjects(`https://www.linkedin.com/`);

  const collection = objects.filter(o => o.data && o.data.$type == 'com.linkedin.voyager.dash.feed.nav.GlobalNav' && o.included && o.included.length)[0];

  if (!collection) {
    return null;
  }

  const profileInfo = collection.included[0];
  console.log(profileInfo);
  chrome.runtime.sendMessage({ action: "linkedInProfile", payload: profileInfo });
}

// ---- popup message handling
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (!client) await initialize();
  console.log(`worker message "${request.action}"`)

  switch (request.action) {
    case 'wakeup':
      // wake up method for start the service worker
      break;
    case 'logout':
      await ChromeLocalStorage.setToken('');
      await client.auth.signOut();

      chrome.runtime.sendMessage({ action: "signin", payload: null });
      off('OFF');
      break;
    case 'auth':
      console.log('auth received');
      // already signed in
      const { data: { user: existingUser } } = await client.auth.getUser();
      if (existingUser) {
        return console.log('session already set');
      }

      await client.auth.setSession(request.payload);

      const { data: { session }, error } = await client.auth.getSession();

      if (error) throw error;
      if (session) {
        await client.auth.setSession(session);
      }

      const { data: { user: auser } } = await client.auth.getUser();
      if (!auser) {
        throw new Error('Invalid auth');
      }

      fetchData();
      console.log("user", auser);
      chrome.runtime.sendMessage({ action: "signin", payload: auser });

      break;
    case 'signinflow':
      const signInUrl = `${WEB}/signin?pwd=true&next=/auth-extension`;
      chrome.tabs.create({ url: signInUrl, active: true }, function (tab) {
        console.log(tab);
      });
      break;
    case 'open':
      const { data: { user: activeUser } } = await client.auth.getUser();
      chrome.runtime.sendMessage({ action: "signin", payload: activeUser });

      if (activeUser) fetchData(`open`, request.status, request.ascending, request.skipPersonalEmails);
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

async function fetchData(src = '', status = 'queued', ascending = false, skipPersonalEmails = false) {
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      console.log('trying to recover session on fetch data...')
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        await client.auth.setSession(session);
      }
    }
  }

  if (!client) {
    console.log('recovering client...')
    await initialize();
  }

  const { data: { user } } = await client.auth.getUser();
  if (!user) return console.log("session lost");

  console.log(`fetching data ${src}`, (new Date()).toISOString(), user.email);

  await chromeAlarm("clear", "fetch");

  // Obtener el conteo de leads pendientes para el badge
  const { count } = await client
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .filter('status', 'eq', 'queued');

  // Construir la query base para el conteo total
  let countQuery = client
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .filter('status', 'eq', 'queued');

  // Aplicar el filtro de emails personales al conteo si está activado
  if (skipPersonalEmails) {
    const personalDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'aol.com', 'icloud.com'];
    countQuery = countQuery.not('email', 'ilike', `%@${personalDomains.join(',%@')}`);
  }

  // Obtener el conteo total
  const { count: totalCount } = await countQuery;
  console.log({ count })

  // Construir la query base para los leads
  let query = client
    .from('leads')
    .select()
    .filter('status', 'eq', status);

  // Añadir filtro de emails personales si está activado
  if (skipPersonalEmails) {
    const personalDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'aol.com', 'icloud.com'];
    query = query.not('email', 'ilike', `%@${personalDomains.join(',%@')}`);
  }

  // Añadir ordenamiento
  query = query.order('created_at', { ascending });

  // Ejecutar la query
  const { data, error } = await query;

  if (error) {
    console.log(error);
    return;
  }

  if (!data) {
    return console.log({ data }, { error });
  }

  console.log(`Found ${data.length} leads`);

  const leads = data.map(lead => {
    const providers = ['gmail', 'hotmail', 'yahoo'];
    lead.isProviderAccount = providers.map(p => lead.email.indexOf('@' + p) !== -1).includes(true);
    return lead;
  });

  // Actualizar el badge siempre con el número de leads pendientes
  chrome.action.setBadgeBackgroundColor({ color: '#CC0000' });
  const badgeText = count > 99 ? '99+' : count ? count.toString() : '';
  chrome.action.setBadgeText({ text: badgeText });

  chrome.runtime.sendMessage({
    action: "leads",
    payload: leads,
    totalCount,
    src
  });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name != 'fetch') return;
  fetchData(`alarm`);
});

// async function logIn() {
//   const currentUser = client.auth.user();
//   return currentUser;
//   if (currentUser) {
//     return currentUser;
//   }

//   const { user, session, error } = await client.auth.signIn({
//     email: 'joserobleda@gmail.com',
//     password: '123456',
//   })

//   return user;
// }

function off(text) {
  chrome.action.setBadgeBackgroundColor({ color: '#CCCCCC' });
  chrome.action.setBadgeText({ text });
};

// --------------- linkedin methods

async function onFindLead(lead) {
  console.log(`Searching contacts`, lead);

  if (!lead.query) {
    console.log(`Query is mandatory to search`);
    processProfiles(lead, []);
    return;
  }

  // search by name only
  if (!lead.company) {
    const profiles = await findProfiles(lead.query);
    console.log(`Find by query ${lead.query}`, profiles);

    processProfiles(lead, profiles);
    return;
  }

  const company = await findOrg(lead.company);

  if (!company) {
    console.log(`Can't find org ${lead.company}`);
    sendProfilesMessage(lead, []);
    return;
  }

  try {
    const profiles = await findProfilesInCompany(company, lead.query);

    processProfiles(lead, profiles);

  } catch (err) {
    console.log(`can't search by company, trying by query`);
    chrome.runtime.sendMessage({
      action: "error", payload: {
        type: err
      }
    });

    return onFindLead({ ...lead, company: null, query: `${lead.query} ${lead.company}` });
  }
}

function processProfiles(lead, profiles) {
  console.log(`Processing profiles`, profiles);

  const getToken = async () => {
    const { data: { user } } = await client.auth.getUser();
    return user?.jwt_token;
  };

  getToken().then(token => {
    fetch(`${WEB}/api/profile-scoring`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ profiles, lead })
    });
  });

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

  const companyUrl = profile.company ? profile.company.navigationUrl : '';

  const { data, error } = await client
    .from('leads')
    .update({
      profile_url: profile.url,
      company_url: companyUrl,
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
  console.log('sending connection request', profile);

  /*
  const url = `https://www.linkedin.com/voyager/api/growth/normInvitations?action=verifyQuotaAndCreate`;
  const payload = {
    invitation: {
      emberEntityName: "growth/invitation/norm-invitation",
      invitee: {
        'com.linkedin.voyager.growth.invitation.InviteeProfile': {
          profileId: profile.id
        },
      },
      trackingId: profile.trackingId,
    }
  };
  */

  const url = `https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2`;

  const memberProfile = `urn:li:fsd_profile:${profile.id}`;
  const payload = {
    invitee: { inviteeUnion: { memberProfile } }
  };

  console.log("post", payload);
  return await postLinked(url, payload);
}

async function findOrg(orgName) {
  const objects = await getLinkedInObjects(`https://www.linkedin.com/search/results/companies/?keywords=${orgName}`);

  const collection = objects.filter(o => o.data && o.data.$type == 'com.linkedin.restli.common.CollectionResponse' && o.included && o.included.length)[0];

  if (!collection) {
    return null;
  }

  const ids = collection.data.elements.reduce((carry, view) => {
    return carry.concat(view['*results'] || []);
  }, []).map(result => result.match(/(\d+)/)[0]);

  const models = ids.map(id => {
    let model = collection.included.filter(model => model.trackingUrn == `urn:li:company:${id}`)[0]
    model.id = id;

    model.vectorImage = model.image.attributes[0].detailDataUnion.nonEntityCompanyLogo.vectorImage;

    return model;
  });

  return models[0];
}

async function findProfiles(query) {
  const objects = await getLinkedInObjects(`https://www.linkedin.com/search/results/people/?keywords=${query}`);

  // const collection = objects.filter(o => o.data && o.data.$type == 'com.linkedin.restli.common.CollectionResponse' && o.included && o.included.length)[0];
  const collection = objects.filter(o => o.data && o.data.data && o.data.data.searchDashClustersByAll)[0];


  if (!collection) {
    return [];
  }

  const invites = await fetchSentInvites()
  const profiles = collection.included.filter(model => model.trackingUrn).map(model => {
    const url = model.navigationUrl.split('?')[0];
    // model.entityUrn: "urn:li:fsd_entityResultViewModel:(urn:li:fsd_profile:ACoAAAQExq0B2nA56ykWxVkTbMjlrMgvK3rsQdg,SEARCH_SRP,DEFAULT)"
    const id = model.entityUrn.match(/urn:li:fsd_profile:([\w\-]+)/)[1];
    const invite = invites.find(invite => invite.toMemberId === id);

    const current = (model.summary?.text || '').replace('Current: ', '');
    const occupation = (current + ' ' + model.primarySubtitle?.text).trim();

    return {
      ...model,
      firstName: model.title.text,
      occupation,
      location: model.secondarySubtitle?.text,
      picture: model.image.attributes[0].detailData.nonEntityProfilePicture.vectorImage,
      id,
      distance: {
        value: model.entityCustomTrackingInfo.memberDistance,
      },
      invite,
      url,
    };
  })

  return profiles;
}

async function findProfilesInCompany(company, name) {
  // const peopleSearchPage = `${company.navigationUrl}people/?keywords=${name}`;
  const url = `https://www.linkedin.com/voyager/api/search/hits?count=12&educationEndYear=List()&educationStartYear=List()&facetCurrentCompany=List(${company.id})&facetCurrentFunction=List()&facetFieldOfStudy=List()&facetGeoRegion=List()&facetNetwork=List()&facetSchool=List()&facetSkillExplicit=List()&keywords=List(${name})&maxFacetValues=15&origin=organization&q=people&start=0&supportedFacets=List(GEO_REGION,SCHOOL,CURRENT_COMPANY,CURRENT_FUNCTION,FIELD_OF_STUDY,SKILL_EXPLICIT,NETWORK)`;
  const stream = await fetchLinkedIn(url, true);
  const response = await stream.json();
  const invites = await fetchSentInvites()

  if (!response.data) {
    console.log(response.data);
    return [];
  }

  console.log(response.data);
  const models = response.data.elements.map(element => {
    // element.entityUrn = "urn:li:fs_miniProfile:ACoAAAQExq0B2nA56ykWxVkTbMjlrMgvK3rsQdg"
    const hit = element.hitInfo;
    if (hit.$type == 'com.linkedin.voyager.search.Paywall') {
      throw new Error(hit.type);
    }

    // trackingId = "1SIRPuYwRwye7TdI4wO1jg=="
    const model = response.included.find(model => model.trackingId == element.trackingId);
    if (!model) {
      return null;
    }

    // id = "ACoAAAQExq0B2nA56ykWxVkTbMjlrMgvK3rsQdg"
    const invite = invites.find(invite => invite.toMemberId === element.hitInfo.id);

    const url = `https://www.linkedin.com/in/${model.publicIdentifier}/`;


    const profile = {
      ...model,
      id: hit.id,
      distance: hit.distance,
      invite,
      url,
      company,
    };

    return profile;
  }).filter(Boolean);

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