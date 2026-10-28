import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Saját hostolású betűk: a „Your pages stay in this browser” ígéret mellett nem tölthetünk a Google-től.
// A teljes súlyfájlokat használjuk: ezekben minden részhalmaznak van unicode-range-e, így a böngésző
// csak azt tölti le, ami a lapon tényleg előfordul (a magyar ő/ű-höz a latin-ext-et). A külön
// „latin-ext-400.css” fájlokból hiányzik a unicode-range — azokkal a „0” jel kiesett, és a `ch`
// egység (a 80 jeles sor szélessége) rossz betűből számolt.
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/libre-caslon-display/400.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
