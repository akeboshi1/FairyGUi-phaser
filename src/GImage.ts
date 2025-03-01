import { ByteBuffer } from './utils/ByteBuffer';
import { FlipType, ObjectPropID } from './FieldTypes';
import { PackageItem } from './PackageItem';
import { Image } from './display/Image';
import { GObject } from './GObject';
import { GRoot } from '.';
export class GImage extends GObject {
    private _image: Image;
    private _flip: number = 0;
    private _contentItem: PackageItem;

    constructor(scene: Phaser.Scene, type: number) {
        super(scene, type);
    }

    public get image(): Image {
        return this._image;
    }

    public get color(): string {
        return this.image.color;
    }

    public set color(value: string) {
        if (this.image.color != value) {
            this.image.color = value;
            this.updateGear(4);
        }
    }

    public get width(): number {
        return this._width;
    }

    public get height(): number {
        return this._height;
    }

    public set width(value: number) {
        this.setSize(value, this._rawHeight);
        this._displayObject.changeSize(this._width, this._height, true);
    }

    public set height(value: number) {
        this.setSize(this._rawWidth, value);
        this._displayObject.changeSize(this._width, this._height, true);

    }

    public get flip(): number {
        return this._flip;
    }

    public set flip(value: number) {
        if (this._flip != value) {
            this._flip = value;

            var sx: number = 1, sy: number = 1;
            if (this._flip == FlipType.Horizontal || this._flip == FlipType.Both)
                sx = -1;
            if (this._flip == FlipType.Vertical || this._flip == FlipType.Both)
                sy = -1;
            this.setScale(sx, sy);
            this.handleXYChanged();
        }
    }

    public get fillMethod(): number {
        return this.image.fillMethod;
    }

    public set fillMethod(value: number) {
        this.image.fillMethod = value;
    }

    public get fillOrigin(): number {
        return this.image.fillOrigin;
    }

    public set fillOrigin(value: number) {
        this.image.fillOrigin = value;
    }

    public get fillClockwise(): boolean {
        return this.image.fillClockwise;
    }

    public set fillClockwise(value: boolean) {
        this.image.fillClockwise = value;
    }

    public get fillAmount(): number {
        return this.image.fillAmount;
    }

    public set fillAmount(value: number) {
        this.image.fillAmount = value;
    }

    public createDisplayObject(): void {
        this._displayObject = this._image = new Image(this.scene);
        // (<any>this._scene).stage.addChild(this._displayObject, 1);
        this._displayObject["$owner"] = this;
    }

    public constructFromResource(): Promise<void> {
        return new Promise((reslove, reject) => {
            this._contentItem = this.packageItem.getBranch();
            this.sourceWidth = this._contentItem.width;
            this.sourceHeight = this._contentItem.height;
            this.initWidth = this.sourceWidth;
            this.initHeight = this.sourceHeight;

            this._contentItem = this._contentItem.getHighResolution();
            this._contentItem.load().then((packageItem: PackageItem) => {
                // 优先九宫格，初始化九宫格各类数据，防止setpackitem时位置数据缺失
                this.setSize(this._contentItem.width, this._contentItem.height);
                this.image.scale9Grid = this._contentItem.scale9Grid;
                this.image.scaleByTile = this._contentItem.scaleByTile;
                this.image.tileGridIndice = this._contentItem.tileGridIndice;
                this.image.setPackItem(this._contentItem).then(() => {
                    reslove();
                });
                // console.log("image pos", this);
                // this.image.setPosition(this._contentItem.x, this._contentItem.y);

                // this.setSize(this.sourceWidth, this.sourceHeight);
            });
        });
    }

    handleSizeChanged() {
        this._displayObject.setSize(this._width, this._height);
        this.changeInteractive();
        // (<Phaser.GameObjects.Container>this.displayObject).setDisplaySize(this._width, this._height);
        // this._displayObject.setInteractive(new Phaser.Geom.Rectangle(0, 0, this._width, this._height), Phaser.Geom.Rectangle.Contains);
    }

    protected handleXYChanged(): void {
        super.handleXYChanged();
        if (this._flip != FlipType.None) {
            if (this.scaleX == -1)
                this.image.x += this._width;
            if (this.scaleY == -1)
                this.image.y += this._height;
        }
    }

    public getProp(index: number): any {
        if (index == ObjectPropID.Color)
            return this.color;
        else
            return super.getProp(index);
    }

    public setProp(index: number, value: any): void {
        if (index == ObjectPropID.Color)
            this.color = value;
        else
            super.setProp(index, value);
    }

    public setup_beforeAdd(buffer: ByteBuffer, beginPos: number): Promise<void> {
        return new Promise((resolve, reject) => {
            super.setup_beforeAdd(buffer, beginPos);

            buffer.seek(beginPos, 5);

            if (buffer.readBool())
                this.color = buffer.readColorS();
            this.flip = buffer.readByte();
            this.image.fillMethod = buffer.readByte();
            if (this.image.fillMethod != 0) {
                this.image.fillOrigin = buffer.readByte();
                this.image.fillClockwise = buffer.readBool();

                this.image.fillAmount = buffer.readFloat();
            }
            this._touchable = false;
            resolve();
        });
    }
}
