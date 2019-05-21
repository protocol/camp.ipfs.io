import axios from 'axios'
import jdown from 'jdown'
import path from 'path'
import chokidar from 'chokidar'
import fs from 'fs'
import util from 'util'
import {
  reloadClientData,
  rebuildRoutes,
  createSharedData,
} from 'react-static/node'

import slug from 'slug'

// promisify readFile
const readFile = util.promisify(fs.readFile)

// hot reload routeData when files change in dev mode
if (process.env.REACT_STATIC_ENV === 'development') {
  chokidar
    .watch('data', { ignoreInitial: true })
    .on('all', () => reloadClientData())
  chokidar
    .watch('content', { ignoreInitial: true })
    .on('all', () => rebuildRoutes())
}

// util to fetch JSON from the filesystem
const readJSON = async file => {
  try {
    const data = await readFile(file, 'utf8')
    return JSON.parse(data)
  } catch (e) {
    throw new Error(e)
  }
}

// loads any contentURL to the content field
const fetchContent = async item => {
  if (item.contentURL) {
    const res = await axios.get(item.contentURL)
    item.content = res.data
  }
  return item
}

// map and resolve all content links
const getContent = async data => {
  return await Promise.all(data.map(item => fetchContent(item)))
}

const resolveContent = async file => {
  try {
    const data = await readJSON(file)
    const content = await getContent(data)
    return content
  } catch (e) {
    throw new Error(e)
  }
}

// setup url safe ids to use for slugs and item ident with manual override
Array.prototype.mapIds = function(cb) {
  return this.map(obj => {
    obj.id = slug(obj.id ? obj.id : obj.fileInfo.name)
    return obj
  })
}

export default {
  // tweaks for CI
  maxThreads: process.env.CI ? 1 : Infinity,
  outputFileRate: process.env.CI ? 10 : 100,
  plugins: [
    'react-static-plugin-typescript',
    'react-static-plugin-styled-components',
    'react-static-plugin-mdx',
    'react-static-plugin-sitemap',
    [
      'react-static-plugin-source-filesystem',
      {
        location: path.resolve('./src/pages'),
      },
    ],
  ],
  siteRoot:
    process.env.CONTEXT === 'production' ? 'https://camp.ipfs.io' : undefined,
  entry: path.join(__dirname, 'src', 'index.tsx'),
  getSiteData: () => ({
    title: 'IPFS Camp, June 27-30 2019 🏕',
    gtagId: 'UA-96910779-12',
    tickets: {
      waitlist: true,
      waitlistCta: 'Join Waitlist',
      waitlistLink: 'Waitlist',
      regCta: 'Apply',
      regLink: 'Register',
    },
    meta: {
      url: 'https://camp.ipfs.io',
      title: '',
      keywords: 'IPFS, IPFS Camp, IPFS Conf, dweb, libp2p, multiformats',
      twitter: 'ipfsbot',
      desc:
        'IPFS Camp is a 3 day hacker retreat designed for the builders of the Distributed Web.',
      lastBuilt: Date.now(),
    },
  }),
  getRoutes: async ({ dev }) => {
    const content = await jdown('content', { fileInfo: true })

    const schedule = await readJSON('./data/schedule.json')
    const formats = content.formats
      .sort((a, b) => (a.title > b.title ? 1 : -1))
      .mapIds()
    const formatsShared = createSharedData(formats)
    const scheduleShared = createSharedData(schedule)

    return [
      {
        path: 'schedule',
        template: 'src/containers/Schedule.mdx',
        sharedData: {
          schedule: scheduleShared,
          formats: formatsShared,
        },
        getData: async () => ({}),
        children: formats.map(format => ({
          path: `formats/${format.id}`,
          template: 'src/containers/Schedule.mdx',
          sharedData: {
            schedule: scheduleShared,
            formats: formatsShared,
          },
          getData: () => ({
            title: 'Session Formats',
            back: {
              to: '/schedule',
              title: 'Schedule',
            },
            meta: {
              title: `${format.title} | Formats`,
            },
            contents: format.contents,
          }),
        })),
      },
    ]
  },
}
