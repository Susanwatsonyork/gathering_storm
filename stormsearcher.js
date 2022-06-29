// Copyright (c) Susan Watson 2020-2022 All rights reserved
// This software is published under the GNU GENERAL PUBLIC LICENSE version 3.

const EventEmitter = require('events');
const moment = require('moment');

class StormSearcher extends EventEmitter {
    constructor(twit) {
        super();
        this.twit = twit;
        this.subjects = [];

        this.subjectIds = new Set();
        this.subjectScreenNames = new Set();

        this.userids = [];
        this.handles = [];

        this.manualRetweetPattern = new RegExp('^RT\\s@','i');
    }

    addSubjects(value) {
        if (Array.isArray(value)) {
            value.forEach((u) => {
                this.subjects.push(u);

                this.userids.push(u.id);
                this.handles.push(u.handle);

                this.subjectIds.add(u.id);
                this.subjectScreenNames.add(u.screen_name.toLocaleLowerCase());       
            })
        }
    }

    makeTwitterQuery() {
        return {
            follow: this.userids.join(','),
            track: this.handles.join(',')
        }
    }

    isUserIdASubject(id) {
        return id && this.subjectIds.has(id);
    }

    isScreenNameASubject(sn) {
        
    }


    //---------- process tweet --------------------

    setSubject(item,id,sn) {
        item.subject = {
            id,
            sn
        }
    }

    identifySubject(item) {
        if (item.author && item.author.isSubject) {
            this.setSubject(item,item.author.id,item.author.sn);
            return;
        }

        if (item.originIsSubject) {
            this.setSubject(item,item.originUserId,item.originSn);
            return;
        }

        if (Array.isArray(item.mentions)) {
            const user = item.mentions.find((v) => this.isUserIdASubject(v.id));
            if (user) {
                this.setSubject(item,user.id,user.sn);
                return;                  
            }
        }

        this.setSubject(item,0,'');
    }


    blankTweet() {
        return {
            timeStamp: null,
            type: '',
            text: '',
            id: '',
            author: null,
            subject: null,
        }
    }

    processUser(value) {
        const user = {
            sn: value.screen_name,
            id: value.id,
            name: value.name,
            followers: value.followers_count,
            statuses: value.statuses_count,
        }

        if (typeof value.lang === 'string' && value.lang.length > 0) {
            user.lang = value.lang;
        }

        user.isSubject = this.isUserIdASubject(user.id);

        return user;
    }

    processEntities(item, entities) {
        if (entities) {
            if (Array.isArray(entities.urls)) {
                item.urls = entities.urls.map((v) => {
                    return ('expanded_url' in v) ? v.expanded_url : v.url;
                });
            }

            if (Array.isArray(entities.user_mentions)) {
                if (!Array.isArray(item.mentions)) {
                    item.mentions = [];
                }
                item.mentions = item.mentions.concat(entities.user_mentions.map((v) => {
                    return {
                        sn: v.screen_name,
                        id: v.id,
                    };
                }));
            }

            if (Array.isArray(entities.media)) {
                item.media = entities.media.map((v) => {
                    return {
                        url: ('expanded_url' in v) ? v.expanded_url : v.url,
                        id: v.id,
                        type: v.type,
                    };
                });
            }
        }
    }

    combineRetweetedText(retweeted, original) {
        if (typeof retweeted === 'string' && retweeted.length > 40 && typeof original === 'string' && original.length > 40) {
            const leftOrig = original.slice(0,40);
            const indexOfOrig = retweeted.indexOf(leftOrig);
            if (indexOfOrig > 4) {
                const concatenatedTweet = retweeted.slice(0,indexOfOrig) + original;
                return concatenatedTweet;
            }
        }

        return original;
    }

    createStormEvent(tweet) {
        const item = this.blankTweet();

        if ('created_at' in tweet) {
            // "Thu Mar 01 22:42:15 +0000 2018"
            const twitterDateFormat = 'ddd MMM DD HH:mm:ss ZZ YYYY';
            item.timeStamp = moment(tweet.created_at, twitterDateFormat);
        }

        if ('id' in tweet) {
            item.id = tweet.id;
        }

        if ('user' in tweet) {
            item.author = this.processUser(tweet.user);
        }

        if ('text' in tweet) {
            item.text = tweet.text;
        }

        if ('extended_tweet' in tweet) {
            if ('full_text' in tweet.extended_tweet) {
                item.text = tweet.extended_tweet.full_text;
            }
            this.processEntities(item, tweet.extended_tweet.entities);
            this.processEntities(item, tweet.extended_tweet.extended_entities);
        } else {
            this.processEntities(item, tweet.entities);
            this.processEntities(item, tweet.extended_entities);
        }

        if (tweet.in_reply_to_status_id) {
            item.type = 'reply';
            item.originId = tweet.in_reply_to_status_id;
            item.originUserId = tweet.in_reply_to_user_id;
            item.originSn = tweet.in_reply_to_screen_name;
            item.originIsSubject = this.isUserIdASubject(item.originUserId);
        }

        if (tweet.is_quote_status) {
            item.type = 'quote';
            item.originId = tweet.quoted_status_id;

            if (tweet.quoted_status) {
                if ('user' in tweet.quoted_status) {
                    const quoted_author = this.processUser(tweet.quoted_status.user);
                    item.originUserId = quoted_author.id;
                    item.originSn = quoted_author.sn;
                    item.originIsSubject = quoted_author.isSubject;
                }

                if ('extended_tweet' in tweet.quoted_status) {
                    if ('full_text' in tweet.quoted_status.extended_tweet) {
                        item.quoted_text = this.combineRetweetedText(
                            tweet.quoted_status.text,
                            tweet.quoted_status.extended_tweet.full_text);
                    }
                    this.processEntities(item, tweet.quoted_status.extended_tweet.entities);
                    this.processEntities(item, tweet.quoted_status.extended_tweet.extended_entities);
                } else {
                    item.quoted_text = tweet.quoted_status.text;
                    this.processEntities(item, tweet.quoted_status.entities);
                    this.processEntities(item, tweet.quoted_status.extended_entities);
                }
            }


        }

        if (tweet.retweeted_status) {
            item.type = 'retweet';
            item.originId = tweet.retweeted_status.id;
            if ('user' in tweet.retweeted_status) {
                const quoted_author = this.processUser(tweet.retweeted_status.user);
                item.originUserId = quoted_author.id;
                item.originSn = quoted_author.sn;
                item.originIsSubject = quoted_author.isSubject;
            }

            if ('extended_tweet' in tweet.retweeted_status) {
                if ('full_text' in tweet.retweeted_status.extended_tweet) {
                    item.text = this.combineRetweetedText(
                        item.text,
                        tweet.retweeted_status.extended_tweet.full_text);
                }
                this.processEntities(item, tweet.retweeted_status.extended_tweet.entities);
                this.processEntities(item, tweet.retweeted_status.extended_tweet.extended_entities);
            } else {
                this.processEntities(item, tweet.retweeted_status.entities);
                this.processEntities(item, tweet.retweeted_status.extended_entities);
            }
    
        }

        if (item.type === '' &&  this.manualRetweetPattern.test(item.text)) {
            item.type = 'manual-retweet';
        }

        this.identifySubject(item);

        if (item.type === '') {
            item.type = item.author.isSubject ? 'subject-tweet' : 'tweet';
        }

        return item;
    }

    onTweet(tweet) {
        const item = this.createStormEvent(tweet);
        if (item.timeStamp)
            this.emit('stormEvent', item);
    }

    startListening() {
        const stream = this.twit.stream('statuses/filter', this.makeTwitterQuery())
        stream.on('tweet', this.onTweet.bind(this));
    }

    async lookupUserDetailsInChunk(subjects) {
        const screenNamesOnly = subjects.map((s) => s.replace(/^@/,''));

        const params = {
            screen_name: screenNamesOnly.join(',')
        };


        return this.twit.post('/users/lookup', params)
        .then(function (users) {
          return users.data.map((u) => {
              return {
                screen_name: u.screen_name,
                name: u.name,
                description: u.description,
                id: u.id,
                followers_count: u.followers_count,
                location: u.location,
                handle: `@${u.screen_name}`
              }
          });
        })
        .catch(function (error) {
          throw error;
        })

    }

    async lookupUserDetails(subjects) {
        let users = [];
        const chunkSize = 50;
        let chunkStart = 0;

        while (chunkStart < subjects.length) {
            const nextChunk = chunkStart + chunkSize;
            const chunkOfIds = subjects.slice(chunkStart,nextChunk);
            chunkStart = nextChunk;
            users = users.concat(await this.lookupUserDetailsInChunk(chunkOfIds));
        }

        return users;
    }

}


module.exports = StormSearcher;
