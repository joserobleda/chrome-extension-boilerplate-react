import React from 'react';
// import { createClient } from '@supabase/supabase-js'
import "./tailwind.css"
import './Popup.css';
import logo from '../../assets/img/logo.svg';

// const NEXT_PUBLIC_SUPABASE_URL = "https://wdvnygveftqzaekowelk.supabase.co"
// const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMDc2ODQ2MCwiZXhwIjoxOTQ2MzQ0NDYwfQ.FcYHzQjhQK9HZrpX6asv0bdcMBcuKtcLUBBFs19-3d8"
// const client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default class Popup extends React.Component {
  state = {
    user: undefined,
    ready: false,
    leads: [],
  };

  async componentDidMount() {
    if (!chrome.runtime.id) return;
    chrome.runtime.sendMessage({ action: "open" });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'signin':
          const user = request.payload;

          this.setState({ user });
          break;
        case 'leads':
          // merge current state leads with new leads data
          let leads = request.payload.map(lead => {
            const prev = this.state.leads.find(cl => cl.id == lead.id) || {};

            return {
              ...lead,
              processing: prev.processing,
              profiles: prev.profiles,
            };
          })

          this.setState({ ready: true, leads });
          break;
        case 'profiles':
          this.onProfiles(request)
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

  leadSelected(lead, i) {
    let leads = [...this.state.leads];
    leads[i] = { ...lead, processing: true };

    this.setState({ leads });
    chrome.runtime.sendMessage({ action: "findLead", payload: lead });
  }

  leadSearch(query, lead, i) {
    lead.query = query;
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

  logOut() {
    chrome.runtime.sendMessage({ action: "logout" });
  }

  render() {
    // Loaded but no user
    if (this.state.user == null) {
      return (
        <div className="flex flex-col	min-h-full bg-blue-100 bg-opacity-10">
          <header className="p-6 shadow-lg bg-white text-base font-bold">
            <p>&nbsp;</p>
          </header>
          <section className="flex items-center	justify-center flex-grow">
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.signInFlow()}>Sign in</button>
          </section>
        </div>
      );
    }

    if (!this.state.user) {
      return (
        <div className="flex flex-col	min-h-full bg-blue-100 bg-opacity-10">
          <header className="p-6 shadow-lg bg-white text-base font-bold">
            <p>&nbsp;</p>
          </header>
          <section className="flex items-center	justify-center flex-grow">
            <img className="h-12 w-12 App-logo" src={logo} alt="loading" />
          </section>
        </div>
      );
    }

    if (this.state.ready === true && this.state.leads.length == 0) {
      return (
        <div className="flex flex-col	min-h-full bg-blue-100 bg-opacity-10">
          <header className="shadow-lg bg-white">
            <div className="flex justify-between items-center">
              <span className="p-6 text-base font-bold">{this.state.user.email}</span>
              <a href="#" className="p-6" onClick={() => this.logOut()}>Logout</a>
            </div>
          </header>
          <section className="flex items-center	justify-center flex-grow">
            <p className="text-5xl font-extrabold text-green-600 text-center">
              You're all set
              <br /><br />
              😎
            </p>
          </section>
        </div>
      );
    }

    const leadList = this.state.leads.map((lead, i) => (
      <LeadCard
        key={lead.id}
        lead={lead}
        onSelected={() => this.leadSelected(lead, i)}
        onSearch={(q) => this.leadSearch(q, lead, i)}
        onDiscard={() => this.leadDiscarded(lead, i)}
      ></LeadCard>
    ));

    return (
      <div className="flex flex-col	min-h-full bg-blue-100 bg-opacity-10">
        <header className="shadow-lg bg-white">
          <div className="flex justify-between items-center">
            <span className="p-6 text-base font-bold">{this.state.user.email}</span>
            <a href="#" className="p-6" onClick={() => this.logOut()}>Logout</a>
          </div>
        </header>
        <section>
          {leadList}
        </section>
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
        <div className="grid grid-cols-5 gap-4 h-8">
          <div className="col-span-2 flex items-center">
            {lead.email}
          </div>
          <div className="flex items-center">
            {lead.name || ''} {lead.org ? '(' + lead.org + ')' : ''}
          </div>
          <div className="col-span-2 flex justify-end items-center">
            <LeadAction
              lead={lead}
              onFind={() => this.props.onSelected()}
              onSearch={(q) => this.props.onSearch(q)}
              onDiscard={() => this.props.onDiscard()}
            ></LeadAction>
          </div>
        </div>
        {lead.profiles &&
          <div>
            <div className={`mt-2 pt-4 border-t ${lead.profiles.length ? 'border-b' : ''} border-blue-100`}>
              {lead.profiles.map(profile =>
                <div key={profile.url} className="grid gap-1 grid-cols-6 mb-4">
                  <div>
                    {profile.picture &&
                      <img src={profile.picture.rootUrl + profile.picture.artifacts[1].fileIdentifyingUrlPathSegment} width="80px" height="80px" className="rounded-full ring ring-blue-400" />
                    }

                    {!profile.picture &&
                      <img src="https://static-exp1.licdn.com/sc/h/1c5u578iilxfi4m4dvc4q810q" width="80px" height="80px" className="rounded-full ring ring-blue-400" />
                    }
                  </div>
                  <div className="col-span-4">
                    <div className="flex items-center">
                      <a href={profile.url} className="text-lg mr-4 hover:underline hover:text-blue-600" target="_blank">{profile.firstName} {profile.lastName}</a>
                    </div>
                    <div>
                      {profile.occupation} {profile.location ? ` · ${profile.location}` : ''}
                    </div>
                    <div className="mt-2">
                      {profile.invite &&
                        <div>
                          <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">Pending</button>

                          {!profile.matching &&
                            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.match(profile)}>Match</button>
                          }

                          {profile.matching &&
                            <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded ml-3">Matching...</button>
                          }
                        </div>
                      }

                      {profile.distance.value == 'DISTANCE_1' && !profile.invite &&
                        <div>
                          <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">Connected</button>
                          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.match(profile)}>Match</button>
                        </div>
                      }

                      {profile.distance.value != 'DISTANCE_1' && !profile.invite &&
                        <div>
                          {profile.connecting &&
                            <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">Connecting...</button>
                          }
                          {!profile.connecting &&
                            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded" onClick={() => this.connect(profile)}>Connect</button>
                          }
                        </div>
                      }

                    </div>
                  </div>
                  <div className="text-right">
                    {profile.company && profile.company.vectorImage &&
                      <img src={profile.company.vectorImage.rootUrl + profile.company.vectorImage.artifacts[0].fileIdentifyingUrlPathSegment} width="40px" height="40px" className="rounded-full ring ring-1 ring-blue-300 inline-block mr-1" />
                    }
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={e => { e.preventDefault(); this.props.onSearch(this.state.search) }} className="text-center mt-4">
              Search manually: &nbsp;
              <input type="text" value={this.state.search} onChange={(e) => this.handleSearchChange(e)} />
              <button type="submit" className="bg-blue-200 hover:bg-blue-300 text-white font-bold py-1 px-4 rounded -ml-1" >🔎</button>
            </form>
          </div>
        }
      </div>
    )
  }
}

class LeadAction extends React.Component {
  constructor(props) {
    super(props);

    const search = this.getDefaultSearchValue();
    this.state = { search };
  }

  getDefaultSearchValue() {
    if (this.props.lead.name) return this.props.lead.name;

    const email = this.props.lead.email;
    const username = email.substring(0, email.indexOf('@'));

    return username;
  }

  handleSearchChange(event) {
    this.setState({ search: event.target.value });
  }

  render() {
    if (this.props.lead.processing) {
      return (<img className="h-7 w-7 App-logo inline-block" src={logo} alt="loading" />);
    }

    if (this.props.lead.profiles) {
      return (
        <div>
          <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">{this.props.lead.profiles.length} results</button>
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded ml-2" onClick={() => this.props.onDiscard()}>Discard</button>
        </div>
      );
    }

    if (this.props.lead.isProviderAccount) {
      return (<form onSubmit={e => { e.preventDefault(); this.props.onSearch(this.state.search) }} className="flex items-center">
        <input type="text" value={this.state.search} onChange={(e) => this.handleSearchChange(e)} />
        <button type="submit" className="bg-blue-200 hover:bg-blue-300 text-white font-bold py-1 px-4 rounded -ml-1" >🔎</button>
      </form>)
    }

    return (<button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded" onClick={() => this.props.onFind()}>Find</button>);
  }
}
