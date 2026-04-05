import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
  props: {
    siteMode: 'visualizer',
  },
})

export default app
