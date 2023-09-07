import * as THREE from 'three';
import { fromBlob } from 'geotiff'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ExtendedController } from './ExtendedController';

// Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb)

// Create the terrain mesh
const terrainMaterial = new THREE.MeshLambertMaterial()
terrainMaterial.color = new THREE.Color(0x41980A)
terrainMaterial.side = THREE.DoubleSide
terrainMaterial.flatShading = true

const terrainGeometry = new THREE.PlaneGeometry(100, 100, 1, 1 )
terrainGeometry.rotateX(-Math.PI / 2)

const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
scene.add(terrainMesh)

// Function that loads DEM
const demFileInput = document.getElementById('dem_file') as HTMLInputElement
demFileInput.addEventListener('change', (e) => loadDEM((e.target as HTMLInputElement).files![0]))
async function loadDEM(file: File) {
    const myGeoTIFF = await fromBlob(file)
    const myGeoTIFFImage = await myGeoTIFF.getImage();
    const width = myGeoTIFFImage.getWidth()
    const height = myGeoTIFFImage.getHeight()
    const resolution = myGeoTIFFImage.getResolution()
    const myRaster = await myGeoTIFFImage.readRasters();
    const myRasterData = myRaster[0]

    // console.log('width = ' + width)
    // console.log('height = ' + height)
    // console.log('resolution = ' + resolution)
    // console.log(myRasterData)

    // Typeguard
    if (typeof myRasterData == 'number')
        throw new Error('myRaster[0] is a number, not a TypedArray');

    // const arr: number[] = []
    // myRasterData.forEach((value) => arr.push(value))
    // const sum = arr.reduce((a, b) => a + b, 0)
    // const avg = (sum / arr.length) || 0

    const geometry = new THREE.PlaneGeometry(width * resolution[0], height * resolution[1], width - 1, height - 1 )
    geometry.rotateX(-Math.PI / 2)

    // Assing elevation for each vertex
    myRasterData.forEach((value, i) => {
        if (typeof value != 'number')
            throw new Error("raster values are not numbers");

        // geometry.attributes.position.setY(i, value - avg)
        geometry.attributes.position.setY(i, value)
    });

    terrainMesh.geometry.dispose()
    terrainMesh.geometry = geometry

    const myRaycaster = new THREE.Raycaster()
    myRaycaster.set(new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0))
    const intersections = myRaycaster.intersectObject(terrainMesh)
    
    if (intersections.length < 1)
        return;

    terrainMesh.translateY(- intersections[0].point.y)
}



// Function that loads ortophoto
const ortoFileInput = document.getElementById('orto_file') as HTMLInputElement
ortoFileInput.addEventListener('change', (e) => loadOrto((e.target as HTMLInputElement).files![0]))
function loadOrto(file: File) {
    
    const url = URL.createObjectURL(file)
    const myTexture = new THREE.TextureLoader().load(url)
    terrainMesh.material.color = new THREE.Color(0xffffff)
    terrainMesh.material.map = myTexture

    terrainMesh.material.needsUpdate = true
}

// Function that loads model
const genioFileInput = document.getElementById('genio_file') as HTMLInputElement
genioFileInput.addEventListener('change', (e) => loadGenio((e.target as HTMLInputElement).files![0]))
function loadGenio(file: File) {
    const url = URL.createObjectURL(file)

    const loader = new GLTFLoader()
    
    loader.load( url, function ( gltf ) {
        gltf.scene.rotateX(- Math.PI / 2)
        gltf.scene.translateY(-100)
    	scene.add( gltf.scene );
        console.log('Model loaded')

    }, undefined, function ( error ) {

    	console.error( error );

    } );
}



const directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
directionalLight.position.set(0, 1, -1)
scene.add( directionalLight );

const light = new THREE.AmbientLight( 0x404040 ); // soft white light
scene.add( light );

// Create the camera
const camera = new THREE.PerspectiveCamera( 75, 1, 0.1, 10000 );
camera.position.set(0, 0, 2)

function resize() {	
    let width = 100
    let height = 100
    const aspectRatioWindow = window.innerWidth / window.innerHeight
    if (aspectRatioWindow < 1) {
        width = window.innerWidth
        height = window.innerWidth
    } else {
        width = window.innerWidth / 2
        height = window.innerHeight
    }
    		
    const aspect_ratio = width / height
    renderer.setSize( width, height )
    camera.aspect = aspect_ratio
    camera.updateProjectionMatrix()
}

// Create the renderer and enable XR

const renderer = new THREE.WebGLRenderer();
resize()
window.addEventListener('resize', () => resize())
renderer.xr.enabled = true;



// Orbit Controls
const controls = new OrbitControls( camera, renderer.domElement );


// VR controls
// Create controllers
const controllers: ExtendedController[] = []
for (let i = 0; i < 2; i++) {
    controllers[i] = new ExtendedController(renderer.xr, i)
}

controllers.forEach((c) => {
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setFromPoints([ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 3000 ) ]) //TODO: change hardcoded line length
    const lineMaterial = new THREE.LineBasicMaterial()
    lineMaterial.opacity = .5
    const line = new THREE.Line(lineGeometry, lineMaterial)

    c.addEventListener('pressstart', (e) => {
        switch (e.data) {
            case 0:
                c.targetRaySpace.add(line)
        }
    })
    c.addEventListener('pressend', (e) => {
        switch (e.data) {
            case 0:
                const raycaster = new THREE.Raycaster()
                raycaster.ray.origin.setFromMatrixPosition(c.targetRaySpace.matrixWorld)
                raycaster.ray.direction.set(0,0,-1).applyMatrix4( new THREE.Matrix4().identity().extractRotation(c.targetRaySpace.matrixWorld) )

                
                const intersections = raycaster.intersectObject(terrainMesh)

                if (intersections.length < 1)
                    return;

                const intersection = intersections[0]

                const cameraRaycaster = new THREE.Raycaster()
                cameraRaycaster.ray.origin = renderer.xr.getCamera().position
                cameraRaycaster.ray.direction.set(0, -1, 0)

                const cameraIntersections = cameraRaycaster.intersectObject(terrainMesh)

                if (cameraIntersections.length < 1)
                    return;

                const cameraIntersection = cameraIntersections[0]

                const cameraGroundPoint = cameraIntersection.point
                const translation = new THREE.Vector3()
                translation.subVectors(cameraGroundPoint, intersection.point)

                // MOVE OBSERVER
                // Get actual reference space
                const baseReferenceSpace = renderer.xr.getReferenceSpace()

                if (!baseReferenceSpace){
                    console.error('No base reference space when moving observer')
                    return
                }

                // Change reference space
                const myTransform = new XRRigidTransform(translation) 
                const newReferenceSpace = baseReferenceSpace.getOffsetReferenceSpace(myTransform)
                renderer.xr.setReferenceSpace(newReferenceSpace)

                c.targetRaySpace.remove(line)

        }
    })
})

controllers.forEach((c) => {
    scene.add(c.gripSpace, c.targetRaySpace)
})


// Append the renderer and the VR button to the page
document.getElementById('viewer')!.appendChild( renderer.domElement );
document.getElementById('viewer')!.appendChild( VRButton.createButton( renderer ) );

// Rendering loop
function render() {  
    // Update controllers
    controllers.forEach((c) => c.update())
    renderer.render( scene, camera );
}

renderer.setAnimationLoop(render)