import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import '@material/web/icon/icon.js';
import '@material/web/button/filled-button.js';
import { Viewer } from './Viewer';

const viewer = new Viewer()

// Function that loads DEM
const demFileInput = document.getElementById('dem_file') as HTMLInputElement
demFileInput.addEventListener('change', (e) => viewer.loadDEM((e.target as HTMLInputElement).files![0]))

// Function that loads ortophoto
const ortoFileInput = document.getElementById('orto_file') as HTMLInputElement
ortoFileInput.addEventListener('change', (e) => viewer.loadOrto((e.target as HTMLInputElement).files![0]))

// Function that loads model
// NOTE: as 10 sept 2023, Meta Quest 2 Browser does not allow to read .glb file uploaded through file input tag,
// the file extension should be manually changed into .png or similar media file extension.
// This probably should be done on a PC before passing the file to Meta Quest 2 headset.
const genioFileInput = document.getElementById('genio_file') as HTMLInputElement
genioFileInput.addEventListener('change', (e) => viewer.loadGenio((e.target as HTMLInputElement).files![0]))

// Append the renderer and the VR button to the page
document.getElementById('viewer')!.appendChild( viewer.renderer.domElement );
document.getElementById('viewer')!.appendChild( VRButton.createButton( viewer.renderer ) );

