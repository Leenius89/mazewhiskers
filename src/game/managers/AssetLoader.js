export class AssetLoader {
    constructor(scene) {
        this.scene = scene;
    }

    preload() {
        // Images
        this.scene.load.image('cat1', 'sources/cat1.png');
        this.scene.load.image('cat2', 'sources/cat2.png');
        this.scene.load.image('building1', 'sources/building1.png');
        this.scene.load.image('building2', 'sources/building2.png');
        this.scene.load.image('building3', 'sources/building3.png');
        this.scene.load.image('milk', 'sources/milk.png');
        this.scene.load.image('fish1', 'sources/fish1.png');
        this.scene.load.image('fish2', 'sources/fish2.png');
        this.scene.load.image('enemy1', 'sources/enemy1.png');
        this.scene.load.image('enemy2', 'sources/enemy2.png');
        this.scene.load.image('goal', 'sources/ith.png');
        this.scene.load.image('goalBackground', 'sources/goalbackground.png');
        this.scene.load.image('apt1', 'sources/apt1.png');
        this.scene.load.image('apt2', 'sources/apt2.png');
        this.scene.load.image('apt3', 'sources/apt3.png');
        this.scene.load.image('dust1', 'sources/dust1.png');
        this.scene.load.image('dust2', 'sources/dust2.png');
    }
}
