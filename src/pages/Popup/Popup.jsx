import React from 'react';
// import { createClient } from '@supabase/supabase-js'
// import "./tailwind.css"
// import './Popup.css';
import logo from '../../assets/img/logo.svg';
import loading from '../../assets/img/loading.svg';
import defaultProfilePic from '../../assets/img/default-profile-pic.png';

// const NEXT_PUBLIC_SUPABASE_URL = "https://wdvnygveftqzaekowelk.supabase.co"
// const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMDc2ODQ2MCwiZXhwIjoxOTQ2MzQ0NDYwfQ.FcYHzQjhQK9HZrpX6asv0bdcMBcuKtcLUBBFs19-3d8"
// const client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
const WEB = 'https://nurturein.vercel.app';

export default class Popup extends React.Component {
  state = {
    user: undefined,
    profile: null,
    profileOpen: false,
    ready: false,
    leads: [],
    upsell: false,
    subscription: undefined,
    sortAscending: false,
    showProcessed: false,
    skipPersonalEmails: false,
    defaultSorting: 'desc',
    totalPendingCount: 0
  };

  async componentDidMount() {
    if (!chrome.runtime?.id) return;

    // Leer las configuraciones del usuario
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get(['skip_personal_emails', 'default_sorting'], (result) => {
        resolve({
          skipPersonalEmails: result.skip_personal_emails || false,
          defaultSorting: result.default_sorting || 'desc'
        });
      });
    });

    this.setState({
      skipPersonalEmails: settings.skipPersonalEmails,
      sortAscending: settings.defaultSorting === 'asc',
    }, () => {
      // Enviar la configuración de ordenamiento y filtro al solicitar los leads
      chrome.runtime.sendMessage({
        action: "open",
        status: 'queued',
        ascending: this.state.sortAscending,
        skipPersonalEmails: this.state.skipPersonalEmails
      });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log(`popup message "${request.action}"`)

      switch (request.action) {
        case 'signin':
          const user = request.payload;
          this.setState({ user });
          break;
        case 'leads':
          if (request.src == 'initialize') break;

          console.log(`leads recieved from ${request.src}`)
          let leads = request.payload.map(lead => {
            const prev = this.state.leads.find(cl => cl.id == lead.id) || {};

            return {
              ...lead,
              processing: prev.processing,
              profiles: prev.profiles,
            };
          })

          this.setState({
            ready: true,
            leads,
            loading: false,
            totalPendingCount: request.totalCount || 0
          });
          break;
        case 'profiles':
          this.onProfiles(request)
          break;
        case 'error':
          this.setState({ upsell: true });
          break;
        case 'linkedInProfile':
          this.setState({ profile: request.payload });
          break;
        case 'subscription':
          this.setState({ subscription: request.payload.subscription });
          break;
      }

      sendResponse();
    });
  }

  onProfiles(request) {
    const { lead, profiles } = request.payload;
    console.log(`${profiles.length} found`, profiles);

    const leads = this.state.leads.map(item => {
      if (lead.id !== item.id) return item;

      return { ...item, processing: false, profiles };
    });


    this.setState({ leads });
  }

  // leadSelected(lead, i) {
  //   console.log('lead selected', lead);
  //   let leads = [...this.state.leads];
  //   leads[i] = { ...lead, processing: true };

  //   this.setState({ leads });
  //   chrome.runtime.sendMessage({ action: "findLead", payload: lead });
  // }

  leadSearch(query, company, lead, i) {
    lead.query = query;
    lead.company = company;
    console.log('lead search', lead);

    let leads = [...this.state.leads];
    leads[i] = { ...lead, processing: true };

    // clean previous list if present
    if (leads[i].profiles) leads[i].profiles = [];

    this.setState({ leads });

    chrome.runtime.sendMessage({ action: "findLead", payload: lead });
    return false;
  }

  leadDiscarded(lead, i) {
    let leads = [...this.state.leads];
    leads[i] = { ...lead, processing: true };

    this.setState({ leads });
    chrome.runtime.sendMessage({ action: "discard", payload: lead });
  }

  signInFlow() {
    chrome.runtime.sendMessage({ action: "signinflow" });
  }

  openWebSite(path = '/') {
    const url = `${WEB}${path}`;
    chrome.tabs.create({ url, active: true }, function (tab) {
      // console.log(tab);
    });
  }

  logOut() {
    chrome.runtime.sendMessage({ action: "logout" });
  }

  toggleSort = () => {
    this.setState(prevState => ({
      sortAscending: !prevState.sortAscending,
      loading: true
    }), () => {
      // Después de actualizar el estado, solicitamos los leads con el nuevo orden
      chrome.runtime.sendMessage({
        action: "open",
        status: this.state.showProcessed ? 'match' : 'queued',
        ascending: this.state.sortAscending
      });
    });
  }

  toggleProcessed = () => {
    this.setState(prevState => ({
      showProcessed: !prevState.showProcessed,
      loading: true
    }), () => {
      chrome.runtime.sendMessage({
        action: "open",
        status: this.state.showProcessed ? 'match' : 'queued',
        ascending: this.state.sortAscending
      });
    });
  }

  render() {
    // Loaded but no user
    if (this.state.user == null) {
      return (
        <div className="flex flex-col min-h-full bg-blue-100 bg-opacity-10">
          <header className="p-6 shadow-lg bg-white text-base font-bold">
            <p>&nbsp;</p>
          </header>
          <section className="flex items-center	justify-center flex-grow">
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.signInFlow()}>Sign in</button>
          </section>
        </div>
      );
    }

    if (this.state.user == undefined) {
      return (
        <div className="flex flex-col min-h-full bg-blue-100 bg-opacity-10">
          <header className="p-6 shadow-lg bg-white text-base font-bold">
            <p>&nbsp;</p>
          </header>
          <section className="flex items-center	justify-center flex-grow">
            <img className="h-12 w-12 App-logo" src={logo} alt="loading" />
          </section>
        </div>
      );
    }

    const sortedLeads = [...this.state.leads]
      .filter(lead => {
        // Filtrar por estado
        if (this.state.showProcessed) {
          return lead.status === 'match';
        }
        return lead.status === 'queued';
      })
      .sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return this.state.sortAscending ? dateA - dateB : dateB - dateA;
      });

    const leadList = sortedLeads.map((lead, i) => (
      <LeadCard
        key={lead.id}
        lead={lead}
        onSelected={() => this.leadSelected(lead, i)}
        onSearch={(query, company) => this.leadSearch(query, company, lead, i)}
        onDiscard={() => this.leadDiscarded(lead, i)}
      ></LeadCard>
    ));

    return (
      <div className="flex flex-col min-h-full bg-blue-100 bg-opacity-10">
        <header className="shadow-lg bg-white">
          <div className="flex justify-between items-center">
            <div className="mr-auto ml-4 flex items-center py-3">
              <img className="mr-2 h-6 w-6" src={logo} alt="loading" />
              <span className="font-montserrat text-2xl font-extrabold text-black">
                <span>Nurture</span><span className="text-orange-500">In</span>
              </span>
            </div>

            <div className="ml-auto">
              <a href="#" onClick={() => this.openWebSite()}>
                {this.state.subscription ?
                  <span className={`text-xs font-semibold inline-block py-1 px-2 capitalize rounded-full text-${this.state.subscription.status == 'active' ? 'green' : 'pink'}-600 bg-${this.state.subscription.status == 'active' ? 'green' : 'pink'}-200 last:mr-0 mr-1`}>
                    {this.state.subscription.status}
                  </span>
                  :
                  <span className="text-xs font-semibold inline-block py-1 px-2 rounded-full text-yellow-600 bg-yellow-200 capitalize last:mr-0 mr-1">
                    Free
                  </span>
                }
              </a>
            </div>
            <div className="relative inline-block text-left mr-4 pl-10" onMouseEnter={() => this.setState({ profileOpen: true })} onMouseLeave={() => this.setState({ profileOpen: false })}>
              <a href="#" onClick={() => this.setState({ profileOpen: !this.state.profileOpen })}>
                <img className="inline-block h-8 w-8 rounded-full ring-2 ring-gray-300 hover:ring-gray-500" src={this.state.profile ? this.state.profile.profilePicture.displayImageReference.vectorImage.rootUrl + this.state.profile.profilePicture.displayImageReference.vectorImage.artifacts[1].fileIdentifyingUrlPathSegment : defaultProfilePic} alt="" />
                <svg className="inline-block ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                </svg>
              </a>

              {this.state.profileOpen &&
                <div className="absolute right-0 z-10 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1" role="none">
                    <a href="#" className="text-gray-700 block px-4 py-2 text-sm">{this.state.user.email}</a>
                    <a href="#" className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-100" onClick={() => this.logOut()}>Sign out</a>

                    {/* <a href="#" class="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-100" role="menuitem" tabindex="-1" id="menu-item-1">Support</a>
                    <a href="#" class="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-100" role="menuitem" tabindex="-1" id="menu-item-2">License</a>
                    <form method="POST" action="#" role="none">
                      <button type="submit" class="text-gray-700 block w-full px-4 py-2 text-left text-sm" role="menuitem" tabindex="-1" id="menu-item-3">Sign out</button>
                    </form> */}
                  </div>
                </div>
              }
            </div>
          </div>
        </header>
        {this.state.ready === true && this.state.leads.length == 0 &&
          <section className="flex items-center	justify-center flex-grow">
            <p className="text-5xl font-extrabold text-green-600 text-center">
              You're all set
              <br /><br />
              😎
            </p>
          </section>
        }

        {this.state.ready === true && this.state.leads.length > 0 &&
          <section>
            <div className="flex justify-between items-center mx-3 mt-3">
              <button
                onClick={this.toggleSort}
                className="bg-orange-200 hover:bg-orange-300 text-white font-bold py-1 px-3 rounded flex items-center gap-2"
                disabled={this.state.loading}
              >
                {this.state.loading ? (
                  <img className="h-4 w-4 App-logo" src={loading} alt="loading" />
                ) : (
                  this.state.sortAscending ? "↑" : "↓"
                )}
                Fecha
              </button>

              <div className="flex rounded-lg bg-gray-100 p-0.5">
                <button
                  onClick={this.toggleProcessed}
                  disabled={this.state.loading}
                  className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${!this.state.showProcessed ? 'bg-white text-gray-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {this.state.loading && !this.state.showProcessed ? (
                    <img className="h-4 w-4 App-logo inline mr-1" src={loading} alt="loading" />
                  ) : null}
                  Pendientes {!this.state.showProcessed && this.state.totalPendingCount > 0 ? `(${this.state.totalPendingCount})` : ''}
                </button>
                <button
                  onClick={this.toggleProcessed}
                  disabled={this.state.loading}
                  className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${this.state.showProcessed ? 'bg-white text-gray-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {this.state.loading && this.state.showProcessed ? (
                    <img className="h-4 w-4 App-logo inline mr-1" src={loading} alt="loading" />
                  ) : null}
                  Procesados
                </button>
              </div>
            </div>
            {this.state.upsell &&
              <div className="bg-red-200 rounded mx-3 mt-3 p-4 text-red-800 font-bold">
                You have reached LinkedIn's search limit. Results may not be accurate for a while.
              </div>
            }
            {this.state.loading ? (
              <div className="flex justify-center items-center mt-8">
                <img className="h-8 w-8 App-logo" src={loading} alt="loading" />
              </div>
            ) : (
              leadList
            )}
          </section>
        }
      </div>
    );
  }
}

class LeadCard extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      lead: this.props.lead,
      search: this.props.lead.name
    };
  }

  static getDerivedStateFromProps(props, state) {
    return {
      lead: props.lead,
      search: state.search
    };
  }

  handleSearchChange(event) {
    this.setState({ search: event.target.value });
  }

  connect(profile) {
    const lead = { ...this.props.lead };
    lead.profiles = lead.profiles.map(profileInList => {
      if (profileInList.trackingId == profile.trackingId) profile.connecting = true;
      return profile;
    });

    this.setState({ lead: lead });
    console.log('connect', this.props.lead, profile)

    chrome.runtime.sendMessage({
      action: "connect", payload: {
        lead: this.props.lead,
        profile,
      }
    });
  }

  match(profile) {
    const lead = { ...this.props.lead };
    lead.profiles = lead.profiles.map(profileInList => {
      if (profileInList.trackingId == profile.trackingId) profile.matching = true;
      return profile;
    });

    this.setState({ lead: lead });

    chrome.runtime.sendMessage({
      action: "match", payload: {
        lead: this.props.lead,
        profile,
      }
    });
  }

  render() {
    const lead = this.state.lead;

    return (
      <div key={lead.id} className="Card bg-white m-3 p-3 rounded-md">
        <div className="grid grid-cols-6 gap-4 h-8">
          <div className="col-span-3 flex items-center flex-col">
            <div className="w-full">
              {lead.email}
              <span className="text-xs text-gray-500 ml-2">
                {new Date(lead.created_at).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })} {new Date(lead.created_at).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            <div className="w-full">
              {lead.name || ''} {lead.org ? '(' + lead.org + ')' : ''}
            </div>
          </div>
          <div className="col-span-3 flex justify-end items-center">
            {/* <form onSubmit={e => { e.preventDefault(); this.props.onSearch(this.state.search) }} className="text-center mr-2">
              <input type="text" value={this.state.search} onChange={(e) => this.handleSearchChange(e)} />
              <button type="submit" className="bg-blue-200 hover:bg-blue-300 text-white font-bold py-1 px-4 rounded -ml-1" >🔎</button>
            </form> */}
            <LeadAction
              lead={lead}
              onFind={() => this.props.onSelected()}
              onSearch={(q, c) => this.props.onSearch(q, c)}
              onDiscard={() => this.props.onDiscard()}
            ></LeadAction>
          </div>
        </div>
        {lead.profiles &&
          <div>
            <div className="mt-2 pt-2">
              <button className="bg-gray-300 text-gray-400 font-bold py-1 px-2 rounded">{this.props.lead.profiles.length} results</button>
            </div>

            {lead.profiles.length > 0 &&
              <div className={`mt-2 pt-2`}>
                {lead.profiles.map((profile, i) =>
                  <div key={profile.url} className={`grid gap-1 grid-cols-8 pt-2 ${i == 0 ? '' : 'mt-2'} border-t border-blue-100`}>
                    <div className="col-span-1">
                      {profile.picture &&
                        <img src={profile.picture.rootUrl + profile.picture.artifacts[0].fileIdentifyingUrlPathSegment} width="90%" className="rounded-full ring ring-blue-400 mt-1" />
                      }

                      {!profile.picture &&
                        <img src="https://static-exp1.licdn.com/sc/h/1c5u578iilxfi4m4dvc4q810q" width="90%" className="rounded-full ring ring-blue-400" />
                      }
                    </div>
                    <div className="col-span-4">
                      <div className="flex items-center">
                        <a href={profile.url} className="text-lg mr-2 hover:underline hover:text-blue-600" target="_blank">{profile.firstName} {profile.lastName}</a>
                      </div>

                      <div>
                        {profile.occupation} {profile.location ? ` · ${profile.location}` : ''}
                      </div>
                      <div className="mt-2">
                        {!profile.invite &&
                          <div className="inline">
                            {profile.distance.value == 'DISTANCE_1' &&
                              <div className="inline">
                                <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded mr-3">Connected</button>
                                {/* <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded mr-3" onClick={() => this.match(profile)}>Match</button> */}
                              </div>
                            }

                            {profile.distance.value != 'DISTANCE_1' &&
                              <div className="inline">
                                {profile.connecting &&
                                  <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded mr-3">Connecting...</button>
                                }
                                {!profile.connecting &&
                                  <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded mr-3" onClick={() => this.connect(profile)}>Connect</button>
                                }
                              </div>
                            }
                          </div>
                        }

                        {profile.invite &&
                          <div className="inline">
                            <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded mr-3">Pending</button>
                          </div>
                        }

                        <div className="inline">
                          {!profile.matching &&
                            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded mr-3" onClick={() => this.match(profile)}>Match</button>
                          }

                          {profile.matching &&
                            <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded mr-3">Matching...</button>
                          }
                        </div>
                      </div>
                    </div>
                    <div className="col-span-3 flex items-start justify-end ">
                      {profile.company &&
                        <div className="flex items-center">
                          <a className="mr-4 hover:underline hover:text-blue-600">{profile.company.title.text}</a>
                          {profile.company.vectorImage &&
                            <img src={profile.company.vectorImage.rootUrl + profile.company.vectorImage.artifacts[0].fileIdentifyingUrlPathSegment} width="30px" height="30px" className="inline-block" />
                          }
                        </div>
                      }
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        }
      </div>
    )
  }
}

class LeadAction extends React.Component {
  constructor(props) {
    super(props);

    // const company = this.getDefaultCompanyValue();
    const search = this.getDefaultSearchValue() + ' ' + this.getDefaultCompanyValue();
    this.state = { search };
  }

  getDefaultSearchValue() {
    if (this.props.lead.name) return this.props.lead.name;

    const email = this.props.lead.email;
    const username = email.substring(0, email.indexOf('@'));

    return username;
  }

  getDefaultCompanyValue() {
    const company = this.props.lead.org || /@(\w+)/gi.exec(this.props.lead.email)[1];

    const providers = ['gmail', 'hotmail', 'yahoo'];
    if (providers.includes(company)) return '';

    return company;
  }

  handleSearchChange(event) {
    this.setState({ search: event.target.value });
  }

  handleCompanyChange(event) {
    this.setState({ company: event.target.value });
  }

  render() {
    if (this.props.lead.processing) {
      return (<img className="h-7 w-7 App-logo inline-block" src={loading} alt="loading" />);
    }

    return (
      <div className="flex">

        <form onSubmit={e => { e.preventDefault(); this.props.onSearch(this.state.search, this.state.company) }} className="flex items-center">
          {/* <div className="relative transform translate-x-1">
            <input value={this.state.company} onChange={(e) => this.handleCompanyChange(e)} type="text" className="block rounded-t-lg px-2.5 pb-2.5 pt-5 w-15 text-sm" placeholder=" " />
            <label className="absolute transform text-sm text-gray-500 -translate-y-4 scale-75 z-1 top-0 -left-1.5 text-orange-600">Company</label>
          </div> */}

          <div className="relative">
            {/* <input type="text" className="force-rounded w-48" value={this.state.search}  /> */}
            <input value={this.state.search} onChange={(e) => this.handleSearchChange(e)} type="text" className="block py-1 px-2 text-xs w-22 border-orange-300 border rounded-l-md" placeholder=" " />
            {/* <label className="absolute transform text-sm text-gray-500 -translate-y-4 scale-75 z-1 top-0 -left-0.5 text-orange-600">Person</label> */}
          </div>

          <button type="submit" className="bg-orange-200 hover:bg-orange-300 rounded-r-md text-white font-bold py-1 px-4">🔎</button>
        </form>

        <button className="bg-gray-100 hover:bg-gray-300 text-white font-bold py-1 px-2 rounded ml-2" onClick={() => this.props.onDiscard()}>🗑</button>
      </div>
    );
  }
}
