import { fromBlob } from 'geotiff'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExtendedController } from './ExtendedController';

export class Viewer {
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    controllers: ExtendedController[]
    scene: THREE.Scene
    terrainMesh: THREE.Mesh
    modelGroup: THREE.Group

    constructor() {
        // Create the scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb)

        // Create the terrain mesh
        const terrainMaterial = new THREE.MeshLambertMaterial()
        terrainMaterial.color = new THREE.Color(0x41980A)
        terrainMaterial.side = THREE.DoubleSide
        terrainMaterial.flatShading = true

        // Dummy plane geometry, to be substituted with loadDEM function
        const terrainGeometry = new THREE.PlaneGeometry(100, 100, 1, 1 )
        terrainGeometry.rotateX(-Math.PI / 2)

        this.terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
        this.scene.add(this.terrainMesh)

        const directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
        directionalLight.position.set(0, 1, -1)
        this.scene.add( directionalLight );

        const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        this.scene.add( light );

        // Empty group to store the model when uploaded
        this.modelGroup = new THREE.Group()
        this.scene.add(this.modelGroup)

        // Create the camera
        this.camera = new THREE.PerspectiveCamera( 75, 1, 0.1, 10000 );
        this.camera.position.set(50, 50, 50)
        this.camera.lookAt(0,0,0)

         
        
        // Create the renderer and enable XR
        this.renderer = new THREE.WebGLRenderer();
        this.resize()
        window.addEventListener('resize', () => this.resize())
        this.renderer.xr.enabled = true;

        // Orbit Controls
        const controls = new OrbitControls( this.camera, this.renderer.domElement );

        // VR controls
        // Create controllers
        this.controllers = []
        for (let i = 0; i < 2; i++) {
            this.controllers[i] = new ExtendedController(this.renderer.xr, i)
        }

        // TODO: should be a separate class?
        // Teleportation
        this.controllers.forEach((c) => {
            // Straight line, to show where to teleport
            const lineGeometry = new THREE.BufferGeometry()
            lineGeometry.setFromPoints([ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 3000 ) ]) //TODO: change hardcoded line length
            const lineMaterial = new THREE.LineBasicMaterial()
            lineMaterial.opacity = .5
            const line = new THREE.Line(lineGeometry, lineMaterial)

            // When user start pressing the select button, a line appears
            c.addEventListener('pressstart', (e) => {
                switch (e.data) {
                    case 0:
                        c.targetRaySpace.add(line)
                }
            })
            // When select button is released, teleport the user
            c.addEventListener('pressend', (e) => {
                switch (e.data) {
                    case 0:
                        // Find destination ground point
                        const raycaster = new THREE.Raycaster()
                        raycaster.ray.origin.setFromMatrixPosition(c.targetRaySpace.matrixWorld)
                        raycaster.ray.direction.set(0,0,-1).applyMatrix4( new THREE.Matrix4().identity().extractRotation(c.targetRaySpace.matrixWorld) )

                        const intersections = raycaster.intersectObjects([this.terrainMesh, this.modelGroup])

                        if (intersections.length < 1)
                            return;

                        const intersection = intersections[0]

                        // Find camera ground point
                        // TODO: should instead be calculated from height from floor given by the headset
                        const cameraRaycaster = new THREE.Raycaster()
                        cameraRaycaster.ray.origin = this.renderer.xr.getCamera().position
                        cameraRaycaster.ray.direction.set(0, -1, 0)

                        const cameraIntersections = cameraRaycaster.intersectObjects([this.terrainMesh, this.modelGroup])

                        if (cameraIntersections.length < 1)
                            return;

                        const cameraIntersection = cameraIntersections[0]

                        const cameraGroundPoint = cameraIntersection.point

                        // Calculate needed translation (from camera ground point to destination ground point)
                        const translation = new THREE.Vector3()
                        translation.subVectors(cameraGroundPoint, intersection.point)

                        // MOVE OBSERVER
                        // Get actual reference space
                        const baseReferenceSpace = this.renderer.xr.getReferenceSpace()

                        if (!baseReferenceSpace){
                            console.error('No base reference space when moving observer')
                            return
                        }

                        // Change reference space
                        const myTransform = new XRRigidTransform(translation) 
                        const newReferenceSpace = baseReferenceSpace.getOffsetReferenceSpace(myTransform)
                        this.renderer.xr.setReferenceSpace(newReferenceSpace)

                        // Remove line
                        c.targetRaySpace.remove(line)

                }
            })
        })

        // Add controllers model to the scene
        this.controllers.forEach((c) => {
            this.scene.add(c.gripSpace, c.targetRaySpace)
        })

        

        this.renderer.setAnimationLoop(() => this.render())
    }

    // Rendering loop
    render() {  
        // Update controllers
        this.controllers.forEach((c) => c.update())
        this.renderer.render( this.scene, this.camera );
    }

    // TODO: this function is specific for the layout of this project, should be made layout-agnostic
    resize() {	
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
        this.renderer.setSize( width, height )
        this.camera.aspect = aspect_ratio
        this.camera.updateProjectionMatrix()
    }

    // TODO: allow also XYZ file, and apply Delaunay triangulation (with delaunator package) to create a geometry
    // Function that loads Digital Elevation Model (currently only as GeoTIFF)
    async loadDEM(file: File) {
        // Parse GeoTIFF
        const myGeoTIFF = await fromBlob(file)
        const myGeoTIFFImage = await myGeoTIFF.getImage();
        const width = myGeoTIFFImage.getWidth()
        const height = myGeoTIFFImage.getHeight()
        const resolution = myGeoTIFFImage.getResolution()
        const myRaster = await myGeoTIFFImage.readRasters();
        const myRasterData = myRaster[0]
    
    
        // Typeguard
        if (typeof myRasterData == 'number')
            throw new Error('myRaster[0] is a number, not a TypedArray');
        
        // Create horizontal plane geometry with dimensions from GeoTIFF
        const geometry = new THREE.PlaneGeometry(width * resolution[0], height * resolution[1], width - 1, height - 1 )
        geometry.rotateX(-Math.PI / 2)
    
        // Assing elevation for each vertex
        myRasterData.forEach((value, i) => {
            if (typeof value != 'number')
                throw new Error("raster values are not numbers");
    
            geometry.attributes.position.setY(i, value)
        });
        
        // Update terrainMesh geometry
        this.terrainMesh.geometry.dispose()
        this.terrainMesh.geometry = geometry
        
        // Move vertically terrainMesh so that central point (x = 0, z = 0) is at y = 0
        const myRaycaster = new THREE.Raycaster()
        myRaycaster.set(new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0))
        const intersections = myRaycaster.intersectObject(this.terrainMesh)
        
        if (intersections.length < 1)
            return;
    
        this.terrainMesh.translateY(- intersections[0].point.y)

        

    }

    // Function that loads orthophoto and apply to terrainMesh
    loadOrto(file: File) {
        if (!(this.terrainMesh.material instanceof THREE.MeshLambertMaterial))
            throw new Error('Mesh material is not MeshLambertMaterial')
    
        const url = URL.createObjectURL(file)
        const myTexture = new THREE.TextureLoader().load(url)
        this.terrainMesh.material.color = new THREE.Color(0xffffff)
        this.terrainMesh.material.map = myTexture
    
        this.terrainMesh.material.needsUpdate = true
    }

    
    // Function that loads building 3d model (as .glb file) and place it in the scene
    loadGenio(file: File) {
        const url = URL.createObjectURL(file)
    
        const loader = new GLTFLoader()
        
        loader.load( url, ( gltf ) => {

            // Following four lines are just a workaround needed by a specific model,
            // should be removed after 12 sep 2023
            // but maybe model created with Archicad may also need a rotation
            gltf.scene.rotateX(- Math.PI / 2)            
            gltf.scene.rotateZ(-1.05)
            gltf.scene.translateY(-120)
            gltf.scene.translateX(-15)
            

            this.modelGroup.add( gltf.scene );
            console.log('Model loaded')
    
        }, undefined, function ( error ) {
    
            console.error( error );
    
        } );
    }
}