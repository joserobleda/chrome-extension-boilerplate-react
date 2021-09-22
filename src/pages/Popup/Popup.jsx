import React from 'react';
// import { createClient } from '@supabase/supabase-js'
import './Popup.css';
import "./tailwind.css"
import logo from '../../assets/img/logo.svg';

// const NEXT_PUBLIC_SUPABASE_URL = "https://wdvnygveftqzaekowelk.supabase.co"
// const NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMDc2ODQ2MCwiZXhwIjoxOTQ2MzQ0NDYwfQ.FcYHzQjhQK9HZrpX6asv0bdcMBcuKtcLUBBFs19-3d8"
// const client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default class Popup extends React.Component {
  state = {
    user: null,
    leads: [],
  };

  async componentDidMount() {
    if (!chrome.runtime.id) return;
    chrome.runtime.sendMessage({ action: "open" });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'auth':
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

          this.setState({ leads });
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

      return { ...item, profiles };
    });

    this.setState({ leads });
  }

  leadSelected(lead, i) {
    let leads = [...this.state.leads];
    leads[i] = { ...lead, processing: true };

    this.setState({ leads });
    chrome.runtime.sendMessage({ action: "findLead", payload: lead });
  }

  leadDiscarded(lead, i) {
    let leads = [...this.state.leads];
    leads[i] = { ...lead, processing: true };

    this.setState({ leads });
    chrome.runtime.sendMessage({ action: "discard", payload: lead });
  }

  render() {
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

    const leadList = this.state.leads.map((lead, i) => (
      <LeadCard
        key={lead.id}
        lead={lead}
        onSelected={() => this.leadSelected(lead, i)}
        onDiscard={() => this.leadDiscarded(lead, i)}
      ></LeadCard>
    ));

    return (
      <div className="flex flex-col	min-h-full bg-blue-100 bg-opacity-10">
        <header className="p-6 shadow-lg bg-white text-base font-bold">
          <p>
            Welcome {this.state.user.email}
          </p>
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

    this.state = { lead: this.props.lead };
  }

  static getDerivedStateFromProps(props, state) {
    return { lead: props.lead };
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
    console.log('match', this.props.lead, profile)

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
            <LeadAction lead={lead} onFind={() => this.props.onSelected()} onDiscard={() => this.props.onDiscard()}></LeadAction>
          </div>
        </div>
        {lead.profiles &&
          <div className="mt-2 pt-4 border-t border-blue-100">
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
                    {profile.occupation}
                  </div>
                  <div className="mt-2">
                    {profile.invite &&
                      <div>
                        <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">Pending</button>
                        <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.match(profile)}>Match</button>
                      </div>
                    }

                    {profile.hit.distance.value == 'DISTANCE_1' && !profile.invite &&
                      <div>
                        <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">Connected</button>
                        <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded ml-3" onClick={() => this.match(profile)}>Match</button>
                      </div>
                    }

                    {profile.hit.distance.value != 'DISTANCE_1' && !profile.invite &&
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
                  {profile.company.image.attributes[0].detailDataUnion.nonEntityCompanyLogo.vectorImage &&
                    <img src={profile.company.image.attributes[0].detailDataUnion.nonEntityCompanyLogo.vectorImage.rootUrl + profile.company.image.attributes[0].detailDataUnion.nonEntityCompanyLogo.vectorImage.artifacts[0].fileIdentifyingUrlPathSegment} width="40px" height="40px" className="rounded-full ring ring-1 ring-blue-300 inline-block mr-1" />
                  }
                </div>
              </div>
            )}
          </div>
        }
      </div>
    )
  }
}

class LeadAction extends React.Component {
  render() {
    if (this.props.lead.profiles) {
      return (
        <div>
          <button className="bg-gray-300 text-gray-400 font-bold py-1 px-3 rounded">{this.props.lead.profiles.length} results</button>
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded ml-2" onClick={() => this.props.onDiscard()}>Discard</button>
        </div>
      );
    }

    if (this.props.lead.processing) {
      return (<img className="h-7 w-7 App-logo inline-block" src={logo} alt="loading" />);
    }

    return (<button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded" onClick={() => this.props.onFind()}>Find</button>);
  }
}
