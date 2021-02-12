#!/usr/bin/env node
//
// automatically search for new anime from Nyaa.si
// add them to transmission
// notify when done
//
const Downloaded = require('./Downloaded');
const Conf = require('./Conf');
const AutoTorrent = require('./AutoTorrent');
const say = require('./Say');

// main 
new AutoTorrent( new Conf, new Downloaded, say );
