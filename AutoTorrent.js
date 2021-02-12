#!/usr/bin/env node
//
// automatically search for new anime from Nyaa.si
// add them to transmission
// notify when done
//
const Transmission = require('transmission');
const {series, retry} = require('async');
const {si} = require('nyaapi');

class AutoTorrent {
    static get_episode(name) {
        let mat = name.match(/\s*([0-9]+)\s*[\(\[].*[\)\]]\.([a-z,0-9]+)/);
        if (mat) {
            return mat[1];
        }
    }

    init_transmission() {
        this.transmission = new Transmission(this.conf.get('transmission'));
    }

    is_episode_needed(interest_id, ep) {
        return ! this.downloaded.has(interest_id, ep);
    }

 
    inspect_nyaa_search_result(list, interest_id, interest_dict, on_done) {
        console.log(`inspecting nyaa search results (${list.length} items) for : ${interest_id}`);
        const {label, search, filters} = interest_dict;

        this.get_transmisison_magnets(magnets => {
            if (! magnets) {
                console.warn('failed to get a list of magnet links from transmission');
                magnets = [];
            }

            let tasks = list.filter(nyaa=> {
                let {name, magnet, seeders, leechers} = nyaa;
                name = name.toLowerCase();

                // is already downloading/downloaded?
                if (magnets.includes(magnet)) {
                    return false;
                }

                // filter name
                for (let filter of [].concat(this.conf.get('common_filters'), filters)) {
                    if (filter instanceof RegExp) {
                        if (! name.match(filter)) {
                            return false;
                        }
                    }
                    else {
                        if (name.indexOf(`${filter}`) === -1) {
                            return false;
                        }
                    }
                }
                // is episode needed?
                let ep = this.constructor.get_episode(name);
                if (typeof ep === 'undefined') return false;
                ep = parseFloat(ep);
                if (! this.is_episode_needed(interest_id, ep)) return false;

                nyaa.__ep__ = ep;

                // has enough seeders?
                if (this.conf.get('nyaa_search').min_seeders && seeders < this.conf.get('nyaa_search').min_seeders) {
                    return false;
                }
                return true;

            }).map(nyaa => {
                let episode = nyaa.__ep__;
                // for each filtered nyaa item, create an async runnable
                return task_done => {
                    let opts = {};
                    const download_to = this.conf.get('download_to');
                    if (download_to) {
                        opts['download-dir'] = download_to;
                    }
                    this.transmission.addUrl(nyaa.magnet, opts, (err, res) => {
                        if (err) {
                            console.warn(`failed to add URL ${nyaa.magnet} : ${err}`);
                            return task_done('transmission-add-url-failed');
                        }
                        console.log(`added '${interest_id}' episode ${episode} ; transmission id:${res.id} ; name:${res.name}`);
                        this.add_job(interest_id, episode, res.id);
                        task_done();
                    });
                }; 
                // end of async runnable
            });    

            // execute each runnable in series
            series(tasks, err => {
                on_done(err);
            });

        }); // get magnets
    }

    get_transmisison_magnets(on_finish) {
        this.transmission.get((err, res) => {
            if (err) {
                console.warn('failed to get a list of jobs from transmission :', err);
                return on_finish();
            }
            let magnet_links = res.torrents.map(t => t.magnetLink);
            on_finish(magnet_links);
        });
    }

    check_nyaa() {
        if (this.check_nyaa_running) {
            console.log('exit check_nyaa because it is still running');
            return;
        }
        this.check_nyaa_running = true;
        
        // call nyaa API generously; waiting 5 sec between each API call
        // when retrying, wait 1 sec inbetween
        
        let funcs = Object.entries(this.conf.get('interests')).map(tuple => {
            const [interest_id, interest_dict] = tuple;
            // create a new async runnable
            return (search_interest_finished) => {
                console.log('nyaa searching :', interest_dict);

                const search_term = interest_dict.search;
                const {n, category} = this.conf.get('nyaa_search');

                retry({times: 5, interval: 1000}, 
                    (nyaa_search_finished) =>{
                        si.search(search_term, n, {category}).then(res => {
                            this.inspect_nyaa_search_result(res, interest_id, interest_dict, ()=>{
                                nyaa_search_finished();
                            });

                        }).catch(err => {
                            console.warn('nyaa search failed :', err);
                            nyaa_search_finished('nyaa-search-failed');

                        });

                    }, 
                    (err) => {
                        if (err) {
                            conosle.warn('tried to search nyaa 5 times, didn\'t work');
                            search_interest_finished('nyaa-search-failed');
                        }
                    }
                ); 

                // wait 5 sec before searching for the next interest
                setTimeout( () => search_interest_finished() , 5000);
            };
        });
        series(funcs, (err, result) => {
            // done
            this.check_nyaa_running = false;
            console.log('check_nyaa finished');
        });

    }
    check_transmission() {
        this.transmission.get((err, result) => {
            if (err) {
                console.warn('failed to check transmission status :', err);
                return;
            }
            result.torrents.filter(
                    r => (r.isFinished
                    || r.status === 6 // seeding 
                    || (r.status === 0 && r.totalSize === r.sizeWhenDone && r.haveValid === r.totalSize)
                ) && `${r.id}` in this.current_jobs
            ).forEach( job => this.on_finished(job.id, job) );
        });
    }

    on_finished(transmission_id, transmission_job_dict) {
        this.transmission.remove(transmission_id, false, // del 
            (err, result) => {
                if (err) {
                    console.warn('failed to remove job from transmission :', transmission_id);
                }
                console.log('job removed from transmission :', transmission_id);

                let {interest_id, episode} = this.current_jobs[transmission_id];
                this.downloaded.add_downloaded(interest_id, episode);
                delete this.current_jobs[transmission_id];

                console.log(`🏁 finished with ${interest_id} episode ${episode}`);

                if (this.say && this.conf.get('voice-notify') === true) {
                    const label = this.conf.get('interests')[interest_id].label;
                    const text = `${label}、第${episode}話のダウンロードが終わりました。`;
                    this.say(text);
                }

            });
    }

    add_job(interest_id, episode, transmission_id) {
        this.current_jobs[`${transmission_id}`] = {
            interest_id,
            episode,
        };
    }

    constructor(conf, downloaded, say) {
        this.say = say;
        this.conf = conf;
        this.downloaded = downloaded;
        console.log('welcome to AutoTorrent : interests :', this.conf.get('interests'));

        this.transmission = new Transmission(this.conf.get('transmission'));
        this.current_jobs = {};

        this.check_nyaa();

        // every hour
        // do NOT pass this.check_nyaa directly to setInterval as this will remove the "this" context
        setInterval(() => { this.check_nyaa(); }, 60 * 60 * 1000);

        // every 5 sec
        setInterval(() => { this.check_transmission(); }, 5 * 1000);
    }
}

module.exports = AutoTorrent;
