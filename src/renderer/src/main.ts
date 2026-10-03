import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const mountedMarker = 'data-agenteque-mounted'

const nodes = document.querySelectorAll('#app')
if (nodes.length !== 1) throw new Error('#app element not found')

const target = nodes[0]
if (!target) throw new Error('#app element not found')
if (target.hasAttribute(mountedMarker)) throw new Error('renderer already mounted')
target.setAttribute(mountedMarker, '')

export default mount(App, { target })
