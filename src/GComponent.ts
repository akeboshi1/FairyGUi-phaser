import { GBasicTextField } from './GBasicTextField';
import { HitArea } from "./utils/HitArea";
import { TranslationHelper } from "./TranslationHelper";
import { PackageItem } from "./PackageItem";
import { PixelHitTest } from "./utils/PixelHitTest";
import { ByteBuffer } from "./utils/ByteBuffer";
import { ChildHitArea } from "./utils/ChildHitArea";
import { ToolSet } from "./utils/ToolSet";
import { ChildrenRenderOrder, OverflowType, ObjectType } from "./FieldTypes";
import { GGroup } from "./GGroup";
import { ScrollPane } from "./ScrollPane";
import { Transition } from "./Transition";
import { Margin } from "./Margin";
import { Controller } from "./Controller";
import { Graphics } from "./display/Graphics";
import { GObject, sGlobalRect, sUpdateInDragging } from "./GObject";
import { Decls, UIPackage } from "./UIPackage";
import { GRoot, Image, DisplayObjectEvent, ObjectName } from ".";
import { TextField } from './display/text/TextField';

export enum ScreenType {
    NONE,
    FULL,
    WIDTH,
    HEIGHT
}
export class GComponent extends GObject {
    private _sortingChildCount: number = 0;
    protected _opaque: boolean;
    private _applyingController?: Controller;
    private _mask?: any;
    private _maskReversed: boolean = false;
    private _maskDisplay;
    // private _g: Phaser.GameObjects.Graphics;

    protected _renderEvent: any;//Phaser.Time.TimerEvent;
    protected _renderTime: Phaser.Time.TimerEvent;

    protected _buildNativeEvent: any;
    protected _buildNativeTime: Phaser.Time.TimerEvent;

    protected _margin: Margin;
    protected _trackBounds: boolean;
    protected _boundsChanged: boolean;
    protected _childrenRenderOrder: number;
    protected _apexIndex: number;

    public _buildingDisplayList: boolean;
    public _children: GObject[];
    public _controllers: Controller[];
    public _transitions: Transition[];
    public _container: Phaser.GameObjects.Container;
    public _scrollPane?: ScrollPane;
    public _alignOffset: Phaser.Geom.Point;



    constructor(scene?: Phaser.Scene, type?: number) {
        super(scene, type);
        this._children = [];
        this._controllers = [];
        this._transitions = [];
        this._margin = new Margin();
        this._alignOffset = new Phaser.Geom.Point();
        this._opaque = false;
        this._childrenRenderOrder = 0;
        this._apexIndex = 0;
    }

    public createDisplayObject(): void {
        if (!this._scene) this.scene = GRoot.inst.scene;
        this._displayObject = this.scene.make.container(undefined, false);
        this._displayObject["$owner"] = this;
        this.container = this._displayObject;
        const _delay = 1;
        this._renderEvent = { delay: _delay, callback: this.__render, callbackScope: this };
        this._buildNativeEvent = { delay: _delay, callback: this.buildNativeDisplayList, callbackScope: this };
    }

    get container(): Phaser.GameObjects.Container {
        return this._container;
    }

    set container(value: Phaser.GameObjects.Container) {
        this._container = value;
    }

    public dispose(): void {
        if (this._renderTime) {
            this._renderTime.remove(false);
            this._renderTime = null;
        }
        if (this._buildNativeTime) {
            this._buildNativeTime.remove(false);
            this._buildNativeTime = null;
        }
        var i: number;
        var cnt: number;

        cnt = this._transitions.length;
        for (i = 0; i < cnt; ++i) {
            var trans: Transition = this._transitions[i];
            trans.dispose();
        }

        cnt = this._controllers.length;
        for (i = 0; i < cnt; ++i) {
            var cc: Controller = this._controllers[i];
            cc.dispose();
        }

        if (this.scrollPane)
            this.scrollPane.dispose();

        cnt = this._children.length;
        for (i = cnt - 1; i >= 0; --i) {
            var obj: GObject = this._children[i];
            obj.parent = null;//avoid removeFromParent call
            obj.dispose();
        }

        this._boundsChanged = false;
        super.dispose();
    }

    public get displayListContainer(): Phaser.GameObjects.Container {
        return this.container;
    }

    public realAddChildDisplayObject(child: GObject, index?: number) {
        const display = <any>child.displayObject;
        const parent = child.parent;
        if (parent) {
            const pivotX = parent._pivotX;
            const pivotY = parent._pivotY;
            if (child.type != ObjectType.Loader) {
                display.x -= display.width * pivotX;
                display.y -= display.height * pivotY;
            }
        }
        if (index === undefined) {
            this.container.add(display);
        } else {
            this.container.addAt(display, index);
        }
        this.displayObject.emit(DisplayObjectEvent.ADDTOSTAGE);
    }

    public addChild(child: GObject): GObject {
        this.addChildAt(child, this._children.length);
        return child;
    }

    public addChildAt(child: GObject, index: number): GObject {
        if (!child)
            throw "child is null";

        if (index >= 0 && index <= this._children.length) {
            if (child.parent == this) {
                this.setChildIndex(child, index);
            }
            else {
                child.removeFromParent();
                child.parent = this;

                var cnt: number = this._children.length;
                if (child.sortingOrder != 0) {
                    this._sortingChildCount++;
                    index = this.getInsertPosForSortingChild(child);
                }
                else if (this._sortingChildCount > 0) {
                    if (index > (cnt - this._sortingChildCount))
                        index = cnt - this._sortingChildCount;
                }

                if (index == cnt)
                    this._children.push(child);
                else
                    this._children.splice(index, 0, child);

                this.childStateChanged(child);
                this.setBoundsChangedFlag();
            }

            return child;
        }
        else {
            throw "Invalid child index";
        }
    }

    private getInsertPosForSortingChild(target: GObject): number {
        var cnt: number = this._children.length;
        var i: number = 0;
        for (i = 0; i < cnt; i++) {
            var child: GObject = this._children[i];
            if (child == target)
                continue;

            if (target.sortingOrder < child.sortingOrder)
                break;
        }
        return i;
    }

    public removeChild(child: GObject, dispose?: boolean): Promise<GObject> {
        return new Promise((reslove, reject) => {
            var childIndex: number = this._children.indexOf(child);
            if (childIndex != -1) {
                this.removeChildAt(childIndex, dispose);
            }
            reslove(child);
        });

    }

    public removeChildAt(index: number, dispose?: boolean): Promise<GObject> {
        return new Promise((reslove, reject) => {
            if (index >= 0 && index < this._children.length) {
                var child: GObject = this._children[index];
                child.parent = null;

                if (child.sortingOrder != 0)
                    this._sortingChildCount--;

                this._children.splice(index, 1);
                child.group = null;
                if (child.inContainer) {
                    child.displayObject.parentContainer.remove(child.displayObject, dispose);
                    // child.displayObject.removeFromDisplayList();
                    // child.displayObject.removeFromUpdateList();
                    if (this._childrenRenderOrder == ChildrenRenderOrder.Arch) {
                        if (!this._buildNativeTime) this._buildNativeTime = this.scene.time.addEvent(this._buildNativeEvent);
                    }
                }

                this.setBoundsChangedFlag();
                reslove(child);
            }
            else {
                throw "Invalid child index";
            }
        });
    }

    public removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void {
        if (beginIndex == undefined) beginIndex = 0;
        if (endIndex == undefined) endIndex = -1;

        if (endIndex < 0 || endIndex >= this._children.length)
            endIndex = this._children.length - 1;

        for (var i: number = beginIndex; i <= endIndex; ++i)
            this.removeChildAt(beginIndex, dispose);
    }

    public getChildAt(index: number): GObject {
        if (index >= 0 && index < this._children.length)
            return this._children[index];
        else
            throw "Invalid child index";
    }

    public getChild(name: string): GObject {
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            if (this._children[i].name == name)
                return this._children[i];
        }

        return null;
    }

    public getChildByPath(path: String): GObject {
        var arr: string[] = path.split(".");
        var cnt: number = arr.length;
        var gcom: GComponent = this;
        var obj: GObject;
        for (var i: number = 0; i < cnt; ++i) {
            obj = gcom.getChild(arr[i]);
            if (!obj)
                break;

            if (i != cnt - 1) {
                if (!(obj instanceof GComponent)) {
                    obj = null;
                    break;
                }
                else
                    gcom = obj;
            }
        }

        return obj;
    }

    public getVisibleChild(name: string): GObject {
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            var child: GObject = this._children[i];
            if (child.internalVisible && child.internalVisible2 && child.name == name)
                return child;
        }

        return null;
    }

    public getChildInGroup(name: string, group: GGroup): GObject {
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            var child: GObject = this._children[i];
            if (child.group == group && child.name == name)
                return child;
        }

        return null;
    }

    public getChildById(id: string): GObject {
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            if (this._children[i]._id == id)
                return this._children[i];
        }

        return null;
    }

    public getChildIndex(child: GObject): number {
        return this._children.indexOf(child);
    }

    public setChildIndex(child: GObject, index: number): void {
        var oldIndex: number = this._children.indexOf(child);
        if (oldIndex == -1)
            throw "Not a child of this container";

        if (child.sortingOrder != 0) //no effect
            return;

        var cnt: number = this._children.length;
        if (this._sortingChildCount > 0) {
            if (index > (cnt - this._sortingChildCount - 1))
                index = cnt - this._sortingChildCount - 1;
        }

        this._setChildIndex(child, oldIndex, index);
    }

    public setChildIndexBefore(child: GObject, index: number): number {
        var oldIndex: number = this._children.indexOf(child);
        if (oldIndex == -1)
            throw "Not a child of this container";

        if (child.sortingOrder != 0) //no effect
            return oldIndex;

        var cnt: number = this._children.length;
        if (this._sortingChildCount > 0) {
            if (index > (cnt - this._sortingChildCount - 1))
                index = cnt - this._sortingChildCount - 1;
        }

        if (oldIndex < index)
            return this._setChildIndex(child, oldIndex, index - 1);
        else
            return this._setChildIndex(child, oldIndex, index);
    }

    protected _setChildIndex(child: GObject, oldIndex: number, index: number): number {
        var cnt: number = this._children.length;
        if (index > cnt)
            index = cnt;

        if (oldIndex == index)
            return oldIndex;

        this._children.splice(oldIndex, 1);
        this._children.splice(index, 0, child);

        if (child.inContainer) {

            var displayIndex: number = 0;
            var g: GObject;
            var i: number;

            if (this._childrenRenderOrder == ChildrenRenderOrder.Ascent) {
                for (i = 0; i < index; i++) {
                    g = this._children[i];
                    if (g.inContainer)
                        displayIndex++;
                }
                if (displayIndex === this.container.list.length)
                    displayIndex--;
                this.container.addAt(child.displayObject, displayIndex);
            }
            else if (this._childrenRenderOrder == ChildrenRenderOrder.Descent) {
                for (i = cnt - 1; i > index; i--) {
                    g = this._children[i];
                    if (g.inContainer)
                        displayIndex++;
                }
                if (displayIndex === this.container.list.length)
                    displayIndex--;
                this.container.addAt(child.displayObject, displayIndex);
            }
            else {
                if (!this._buildNativeTime) this._buildNativeTime = this.scene.time.addEvent(this._buildNativeEvent);
                //Laya.timer.callLater(this, this.buildNativeDisplayList);
            }

            this.setBoundsChangedFlag();
        }

        return index;
    }

    public swapChildren(child1: GObject, child2: GObject): void {
        var index1: number = this._children.indexOf(child1);
        var index2: number = this._children.indexOf(child2);
        if (index1 == -1 || index2 == -1)
            throw "Not a child of this container";
        this.swapChildrenAt(index1, index2);
    }

    public swapChildrenAt(index1: number, index2: number): void {
        var child1: GObject = this._children[index1];
        var child2: GObject = this._children[index2];

        this.setChildIndex(child1, index2);
        this.setChildIndex(child2, index1);
    }

    public get numChildren(): number {
        return this._children.length;
    }

    public isAncestorOf(child: GObject): boolean {
        if (!child)
            return false;

        var p: GComponent = child.parent;
        while (p) {
            if (p == this)
                return true;

            p = p.parent;
        }
        return false;
    }

    public addController(controller: Controller): void {
        this._controllers.push(controller);
        controller.parent = this;
        this.applyController(controller);
    }

    public getControllerAt(index: number): Controller {
        return this._controllers[index];
    }

    public getController(name: string): Controller {
        var cnt: number = this._controllers.length;
        for (var i: number = 0; i < cnt; ++i) {
            var c: Controller = this._controllers[i];
            if (c.name == name)
                return c;
        }

        return null;
    }

    public removeController(c: Controller): void {
        var index: number = this._controllers.indexOf(c);
        if (index == -1)
            throw new Error("controller not exists");

        c.parent = null;
        this._controllers.splice(index, 1);

        var length: number = this._children.length;
        for (var i: number = 0; i < length; i++) {
            var child: GObject = this._children[i];
            child.handleControllerChanged(c);
        }
    }

    public get controllers(): Controller[] {
        return this._controllers;
    }

    public childStateChanged(child: GObject): void {
        if (this._buildingDisplayList)
            return;

        var cnt: number = this._children.length;
        if (child instanceof GGroup) {
            for (var i: number = 0; i < cnt; i++) {
                var g: GObject = this._children[i];
                if (g.group == child)
                    this.childStateChanged(g);
            }
            return;
        }

        if (!child.displayObject || child.name === "mask")
            return;

        if (child.internalVisible) { // && child.displayObject !== this._displayObject.mask) {
            // 没有父容器且没有上一级fairygui对象 直接添加在scene的根容器上
            if (!child.displayObject.parentContainer) {
                var index: number = 0
                if (this._childrenRenderOrder == ChildrenRenderOrder.Ascent) {
                    for (i = 0; i < cnt; i++) {
                        g = this._children[i];
                        if (g == child)
                            break;

                        if (g.displayObject && g.displayObject.parentContainer)
                            index++;
                    }
                    if (this.container) {
                        this.container.addAt(child.displayObject, index);
                    } else {
                        GRoot.inst.addToStage(child.displayObject);
                    }
                    // console.log("add display", child);
                }
                else if (this._childrenRenderOrder == ChildrenRenderOrder.Descent) {
                    for (i = cnt - 1; i >= 0; i--) {
                        g = this._children[i];
                        if (g.name === "mask")
                            continue;
                        if (g == child)
                            break;

                        if (g.displayObject && g.displayObject.parentContainer)
                            index++;
                    }
                    this.realAddChildDisplayObject(child, index);
                    // this.container.addAt(child.displayObject, index);
                }
                else {
                    this.realAddChildDisplayObject(child);
                    if (!this._buildNativeTime) this._buildNativeTime = this.scene.time.addEvent(this._buildNativeEvent);
                    // Laya.timer.callLater(this, this.buildNativeDisplayList);
                }
            }
        }
        else {
            if (child.displayObject.parentContainer) {
                this.container.remove(child.displayObject);
                child.displayObject.removeFromUpdateList();
                child.displayObject.removeFromDisplayList();
                // console.log("remove display", child);
                if (this._childrenRenderOrder == ChildrenRenderOrder.Arch) {
                    if (!this._buildNativeTime) this._buildNativeTime = this.scene.time.addEvent(this._buildNativeEvent);
                }
                this.displayObject.emit(DisplayObjectEvent.REMOVEFROMSTAGE);
            }
        }
    }

    protected buildNativeDisplayList(): void {
        if (!this._displayObject)
            return;
        var cnt: number = this._children.length;
        if (cnt == 0)
            return;

        var i: number;
        var child: GObject;
        switch (this._childrenRenderOrder) {
            case ChildrenRenderOrder.Ascent:
                {
                    for (i = 0; i < cnt; i++) {
                        child = this._children[i];
                        if (child.displayObject && child.internalVisible && child.name !== "mask") {
                            this.realAddChildDisplayObject(child);
                        } else {
                            if (child.displayObject.parentContainer) child.displayObject.parentContainer.remove(child.displayObject);
                        }
                        //this.container.add(child.displayObject);
                    }
                }
                break;
            case ChildrenRenderOrder.Descent:
                {
                    for (i = cnt - 1; i >= 0; i--) {
                        child = this._children[i];
                        if (child.displayObject && child.internalVisible && child.name !== "mask") {
                            this.realAddChildDisplayObject(child);
                        } else {
                            if (child.displayObject.parentContainer) child.displayObject.parentContainer.remove(child.displayObject);
                        }
                    }
                }
                break;

            case ChildrenRenderOrder.Arch:
                {
                    var apex: number = ToolSet.clamp(this._apexIndex, 0, cnt);
                    for (i = 0; i < apex; i++) {
                        child = this._children[i];
                        if (child.displayObject && child.internalVisible && child.name !== "mask") {
                            this.realAddChildDisplayObject(child);
                        } else {
                            if (child.displayObject.parentContainer) child.displayObject.parentContainer.remove(child.displayObject);
                        }
                    }
                    for (i = cnt - 1; i >= apex; i--) {
                        child = this._children[i];
                        if (child.displayObject && child.internalVisible && child.name !== "mask") {
                            this.realAddChildDisplayObject(child);
                        } else {
                            if (child.displayObject.parentContainer) child.displayObject.parentContainer.remove(child.displayObject);
                        }
                    }
                }
                break;
        }
    }

    public applyController(c: Controller): void {
        this._applyingController = c;
        var child: GObject;
        var length: number = this._children.length;
        for (var i: number = 0; i < length; i++) {
            child = this._children[i];
            child.handleControllerChanged(c);
        }
        this._applyingController = null;
        c.runActions();
    }

    public applyAllControllers(): void {
        var cnt: number = this._controllers.length;
        for (var i: number = 0; i < cnt; ++i) {
            this.applyController(this._controllers[i]);
        }
    }

    public adjustRadioGroupDepth(obj: GObject, c: Controller): void {
        var cnt: number = this._children.length;
        var i: number;
        var child: GObject;
        var myIndex: number = -1, maxIndex: number = -1;
        for (i = 0; i < cnt; i++) {
            child = this._children[i];
            if (child == obj) {
                myIndex = i;
            }
            else if (("relatedController" in child)/*is button*/ && (<any>child).relatedController == c) {
                if (i > maxIndex)
                    maxIndex = i;
            }
        }
        if (myIndex < maxIndex) {
            //如果正在applyingController，此时修改显示列表是危险的，但真正排除危险只能用显示列表的副本去做，这样性能可能损耗较大，
            //这里取个巧，让可能漏过的child补一下handleControllerChanged，反正重复执行是无害的。
            if (this._applyingController)
                this._children[maxIndex].handleControllerChanged(this._applyingController);
            this.swapChildrenAt(myIndex, maxIndex);
        }
    }

    public getTransitionAt(index: number): Transition {
        return this._transitions[index];
    }

    public getTransition(transName: string): Transition {
        var cnt: number = this._transitions.length;
        for (var i: number = 0; i < cnt; ++i) {
            var trans: Transition = this._transitions[i];
            if (trans.name == transName)
                return trans;
        }

        return null;
    }

    public isChildInView(child: GObject): boolean {
        if (this.scrollRect) {
            return child.x + child.width >= 0 && child.x <= this.width
                && child.y + child.height >= 0 && child.y <= this.height;
        }
        else if (this._scrollPane) {
            return this._scrollPane.isChildInView(child);
        }
        else
            return true;
    }

    public getFirstChildInView(): number {
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            var child: GObject = this._children[i];
            if (this.isChildInView(child))
                return i;
        }
        return -1;
    }

    public get scrollPane(): ScrollPane {
        return this._scrollPane;
    }

    public get opaque(): boolean {
        return this._opaque;
    }

    public set opaque(value: boolean) {
        if (this._opaque != value) {
            this._opaque = value;
            if (this._opaque) {
                if (!this.hitArea) {
                    this.hitArea = new Phaser.Geom.Rectangle();
                }


                if (this.hitArea instanceof Phaser.Geom.Rectangle)
                    this.hitArea.setTo((0.5 - this._pivotX) * this.initWidth, (0.5 - this._pivotY) * this.initHeight, this.initWidth, this.initHeight);
                this._displayObject.setInteractive(this.hitArea, Phaser.Geom.Rectangle.Contains);
            }
            else {
                if (this.hitArea instanceof Phaser.Geom.Rectangle)
                    this.hitArea = null;

                this.removeInteractive();
                // this._displayObject.disableInteractive();
                // this._displayObject.mouseThrough = true;
            }
        }
    }

    public get margin(): Margin {
        return this._margin;
    }

    public set margin(value: Margin) {
        this._margin.copy(value);
        if (this.scrollRect) {
            this.container.setPosition((this._margin.left + this._alignOffset.x) * GRoot.dpr, (this._margin.top + this._alignOffset.y) * GRoot.dpr);
        }
        this.handleSizeChanged();
    }

    public get childrenRenderOrder(): number {
        return this._childrenRenderOrder;
    }

    public set childrenRenderOrder(value: number) {
        if (this._childrenRenderOrder != value) {
            this._childrenRenderOrder = value;
            this.buildNativeDisplayList();
        }
    }

    public get apexIndex(): number {
        return this._apexIndex;
    }

    public set apexIndex(value: number) {
        if (this._apexIndex != value) {
            this._apexIndex = value;

            if (this._childrenRenderOrder == ChildrenRenderOrder.Arch)
                this.buildNativeDisplayList();
        }
    }

    public get mask(): Graphics {
        return this._mask;
    }

    public set mask(value: Graphics) {
        this.setMask(value, false);
    }

    public setMask(value, reversed: boolean): void {
        if (this._mask && this._mask != value) {
            if (this._mask.blendMode == "destination-out")
                this._mask.blendMode = null;
        }

        this._mask = value;
        this._maskReversed = reversed;
        if (!this._mask) {
            this._displayObject.clearMask();
            if (this.hitArea instanceof ChildHitArea)
                this.hitArea = null;
            return;
        }
    }

    public get baseUserData(): string {
        var buffer: ByteBuffer = this.packageItem.rawData;
        buffer.seek(0, 4);
        return buffer.readS();
    }

    protected updateHitArea(): void {
        if (this.hitArea instanceof Phaser.Geom.Rectangle) {
            this.hitArea.setTo(this._width >> 1, this._height >> 1, this._width, this._height);
            if (this._opaque) {
                this._scene.sys["input"].setHitArea(this.displayObject, this.hitArea);
            }
        }
    }

    protected updateMask(): void {
        var rect: Phaser.Geom.Rectangle = this.scrollRect;
        if (!rect)
            rect = new Phaser.Geom.Rectangle();

        rect.x = this._margin.left;
        rect.y = this._margin.top;
        rect.width = this._width - this._margin.right;
        rect.height = this._height - this._margin.bottom;

        this.scrollRect = rect;
    }

    protected setupScroll(buffer: ByteBuffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._displayObject == this.container) {
                this.container = new Phaser.GameObjects.Container(this.scene);
                this._displayObject.add(this.container);
            }
            this._scrollPane = new ScrollPane(this);
            this._scrollPane.setup(buffer).then(() => {
                resolve();
            });
        });
    }

    protected setupOverflow(overflow: number): void {
        if (overflow == OverflowType.Hidden) {
            if (this._displayObject == this.container) {
                this.container = new Phaser.GameObjects.Container(this.scene);
                this._displayObject.add(this.container);
            }
            this.updateMask();
            this.container.setPosition(this._margin.left * GRoot.dpr, this._margin.top * GRoot.dpr);
        }
        else if (this._margin.left != 0 || this._margin.top != 0) {
            if (this._displayObject == this.container) {
                this.container = new Phaser.GameObjects.Container(this.scene);
                this._displayObject.add(this.container);
            }
            this.container.setPosition(this._margin.left * GRoot.dpr, this._margin.top * GRoot.dpr);
        }
    }

    protected handleSizeChanged(): void {
        super.handleSizeChanged();
        if (this._scrollPane)
            this._scrollPane.onOwnerSizeChanged();
        else if (this.scrollRect)
            this.updateMask();

        if (this.hitArea) {
            this.updateHitArea();
        }

    }

    protected handleGrayedChanged(): void {
        var c: Controller = this.getController("grayed");
        if (c) {
            c.selectedIndex = this.grayed ? 1 : 0;
            return;
        }

        var v: boolean = this.grayed;
        var cnt: number = this._children.length;
        for (var i: number = 0; i < cnt; ++i) {
            this._children[i].grayed = v;
        }
    }

    public handleControllerChanged(c: Controller): void {
        super.handleControllerChanged(c);

        if (this._scrollPane)
            this._scrollPane.handleControllerChanged(c);
    }

    public setBoundsChangedFlag(): void {
        if (!this._scrollPane && !this._trackBounds)
            return;

        if (!this._boundsChanged) {
            this._boundsChanged = true;

            // if (!this._renderTime) 
            this.scene.time.delayedCall(200, this.__render, undefined, this);
            //addEvent(this._renderEvent);
            //Laya.timer.callLater(this, this.__render);
        }
    }

    protected __render(): void {
        if (this._boundsChanged) {
            var i1: number = 0;
            var len: number = this._children.length;
            var child: GObject
            for (i1 = 0; i1 < len; i1++) {
                child = this._children[i1];
                child.ensureSizeCorrect();
            }
            this.updateBounds();
        }
    }

    public ensureBoundsCorrect(): void {
        var i1: number = 0;
        var len: number = this._children.length;
        var child: GObject
        for (i1 = 0; i1 < len; i1++) {
            child = this._children[i1];
            child.ensureSizeCorrect();
        }

        if (this._boundsChanged)
            this.updateBounds();
    }

    protected updateBounds(): void {
        var ax: number = 0, ay: number = 0, aw: number = 0, ah: number = 0;
        var len: number = this._children.length;
        if (len > 0) {
            ax = Number.POSITIVE_INFINITY, ay = Number.POSITIVE_INFINITY;
            var ar: number = Number.NEGATIVE_INFINITY, ab: number = Number.NEGATIVE_INFINITY;
            var tmp: number = 0;
            var i1: number = 0;

            for (i1 = 0; i1 < len; i1++) {
                var child: GObject = this._children[i1];
                tmp = child.x;
                if (tmp < ax)
                    ax = tmp;
                tmp = child.y;
                if (tmp < ay)
                    ay = tmp;
                tmp = child.x + child.actualWidth;
                if (tmp > ar)
                    ar = tmp;
                tmp = child.y + child.actualHeight;
                if (tmp > ab)
                    ab = tmp;
            }
            aw = ar - ax;
            ah = ab - ay;
        }
        this.setBounds(ax, ay, this.initWidth, this.initHeight);
    }

    public setBounds(ax: number, ay: number, aw: number, ah: number): void {
        this._boundsChanged = false;

        if (this._opaque) {
            this.hitArea = new Phaser.Geom.Rectangle(0, 0, aw, ah);
            if (this._displayObject) {
                if (!this._displayObject.input) this._displayObject.setInteractive(this.hitArea, Phaser.Geom.Rectangle.Contains);
                else this._displayObject.input.hitArea = this.hitArea;
            }
            // console.log("set bounds", aw, ah);

            // if (this._g) {
            //     this._g.clear();
            // } else {
            //     this._g = this.scene.make.graphics(undefined, false);
            // }
            // this._g.fillStyle(0xFFCC00, .4);
            // this._g.fillRect(0, 0, aw, ah);
            //(<Phaser.GameObjects.Container>this.displayObject).add(this._g);
        }
        if (this._scrollPane)
            this._scrollPane.setContentSize(aw, ah);
    }

    public get viewWidth(): number {
        if (this._scrollPane)
            return this._scrollPane.viewWidth;
        else
            return this.width - this._margin.left - this._margin.right;
    }

    public set viewWidth(value: number) {
        if (this._scrollPane)
            this._scrollPane.viewWidth = value;
        else
            this.width = value + this._margin.left + this._margin.right;
    }

    public get viewHeight(): number {
        if (this._scrollPane)
            return this._scrollPane.viewHeight;
        else
            return this.height - this._margin.top - this._margin.bottom;
    }

    public set viewHeight(value: number) {
        if (this._scrollPane)
            this._scrollPane.viewHeight = value;
        else
            this.height = value + this._margin.top + this._margin.bottom;
    }

    public getSnappingPosition(xValue: number, yValue: number, result?: Phaser.Geom.Point): Phaser.Geom.Point {
        return this.getSnappingPositionWithDir(xValue, yValue, 0, 0, result);
    }

    /**
     * dir正数表示右移或者下移，负数表示左移或者上移
     */
    public getSnappingPositionWithDir(xValue: number, yValue: number, xDir: number, yDir: number, result?: Phaser.Geom.Point): Phaser.Geom.Point {
        if (!result)
            result = new Phaser.Geom.Point();

        var cnt: number = this._children.length;
        if (cnt == 0) {
            result.x = 0;
            result.y = 0;
            return result;
        }

        this.ensureBoundsCorrect();

        var obj: GObject = null;
        var prev: GObject = null;
        var i: number = 0;
        if (yValue != 0) {
            for (; i < cnt; i++) {
                obj = this._children[i];
                if (yValue < obj.y) {
                    if (i == 0) {
                        yValue = 0;
                        break;
                    }
                    else {
                        prev = this._children[i - 1];
                        if (yValue < prev.y + prev.actualHeight / 2) //top half part
                            yValue = prev.y;
                        else //bottom half part
                            yValue = obj.y;
                        break;
                    }
                }
            }

            if (i == cnt)
                yValue = obj.y;
        }

        if (xValue != 0) {
            if (i > 0)
                i--;
            for (; i < cnt; i++) {
                obj = this._children[i];
                if (xValue < obj.x) {
                    if (i == 0) {
                        xValue = 0;
                        break;
                    }
                    else {
                        prev = this._children[i - 1];
                        if (xValue < prev.x + prev.actualWidth / 2) //top half part
                            xValue = prev.x;
                        else //bottom half part
                            xValue = obj.x;
                        break;
                    }
                }
            }

            if (i == cnt)
                xValue = obj.x;
        }

        result.x = xValue;
        result.y = yValue;
        return result;
    }

    public childSortingOrderChanged(child: GObject, oldValue: number, newValue: number): void {
        if (newValue == 0) {
            this._sortingChildCount--;
            this.setChildIndex(child, this._children.length);
        }
        else {
            if (oldValue == 0)
                this._sortingChildCount++;

            var oldIndex: number = this._children.indexOf(child);
            var index: number = this.getInsertPosForSortingChild(child);
            if (oldIndex < index)
                this._setChildIndex(child, oldIndex, index - 1);
            else
                this._setChildIndex(child, oldIndex, index);
        }
    }

    public constructFromResource(): Promise<void> {
        return new Promise((reslove, reject) => {
            this.constructFromResource2(null, 0).then(() => {
                reslove();
            }).catch((error) => {
                console.log(error);
                reject();
            });
        });
    }

    public async constructFromResource2(objectPool: GObject[], poolIndex: number): Promise<void> {
        return new Promise((reslove, reject) => {
            var contentItem: PackageItem = this.packageItem.getBranch();
            if (!contentItem.decoded) {
                contentItem.decoded = true;
                TranslationHelper.translateComponent(contentItem);
            }
            var i: number;
            var dataLen: number;
            var curPos: number;
            var nextPos: number;
            var f1: number;
            var f2: number;
            let i1: number;
            let i2: number;

            var buffer: ByteBuffer = contentItem.rawData;
            buffer.seek(0, 0);

            this._underConstruct = true;

            this.sourceWidth = buffer.readInt();
            this.sourceHeight = buffer.readInt();
            this.initWidth = this.sourceWidth;
            this.initHeight = this.sourceHeight;

            if (!this.displayObject) this.createDisplayObject();
            // 必须先设置原始尺寸，否则后续relationItem的targetWidth/targetHeight值为0
            this.setSize(this.sourceWidth, this.sourceHeight);

            if (buffer.readBool()) {
                this.minWidth = buffer.readInt();
                this.maxWidth = buffer.readInt();
                this.minHeight = buffer.readInt();
                this.maxHeight = buffer.readInt();
            }

            if (buffer.readBool()) {
                f1 = buffer.readFloat();
                f2 = buffer.readFloat();
                let boo = buffer.readBool();
                if (f1 !== 0 || f2 !== 0) boo = true;
                this.internalSetPivot(f1, f2, boo);
            }

            if (buffer.readBool()) {
                this._margin.top = buffer.readInt();
                this._margin.bottom = buffer.readInt();
                this._margin.left = buffer.readInt();
                this._margin.right = buffer.readInt();
            }

            // ===================
            const fun0 = () => {
                if (buffer.readBool())
                    buffer.skip(8);

                this._buildingDisplayList = true;

                buffer.seek(0, 1);

                var controllerCount: number = buffer.readShort();
                for (i = 0; i < controllerCount; i++) {
                    nextPos = buffer.readShort();
                    nextPos += buffer.position;

                    var controller: Controller = new Controller();
                    this._controllers.push(controller);
                    controller.parent = this;
                    controller.setup(buffer);

                    buffer.position = nextPos;
                }

                buffer.seek(0, 2);
                var child: GObject;
                var childCount: number = buffer.readShort();
                let hasAsync: boolean = false;
                let delayNum: number = -1;
                const fun = (index) => {
                    for (i = index; i < childCount; i++) {
                        if (hasAsync) {
                            return;
                        }
                        dataLen = buffer.readShort();
                        curPos = buffer.position;

                        if (objectPool) {
                            child = objectPool[poolIndex + i];
                        }
                        else {
                            buffer.seek(curPos, 0);

                            var type: number = buffer.readByte();
                            var src: string = buffer.readS();
                            var pkgId: string = buffer.readS();

                            var pi: PackageItem = null;
                            if (src != null) {
                                var pkg: UIPackage;
                                if (pkgId != null)

                                    pkg = UIPackage.getById(pkgId);
                                else
                                    pkg = contentItem.owner;

                                pi = pkg ? pkg.getItemById(src) : null;
                            }
                            if (pi) {
                                delayNum = i;
                                hasAsync = true;
                                child = Decls.UIObjectFactory.newObject(pi);
                                child.constructFromResource().then(() => {
                                    child._underConstruct = true;
                                    if (child.type === ObjectType.Tree || child.type === ObjectType.List || child.type === ObjectType.Loader || child.type === ObjectType.Image || child.type === ObjectType.Loader) {
                                        // @ts-ignore
                                        child.setup_beforeAdd(buffer, curPos).then(() => {
                                            hasAsync = false;
                                            child.parent = this;
                                            this._children.push(child);
                                            buffer.position = curPos + dataLen;
                                            fun(++delayNum);
                                        })
                                    } else {
                                        hasAsync = false;
                                        child.setup_beforeAdd(buffer, curPos);
                                        child.parent = this;
                                        this._children.push(child);
                                        buffer.position = curPos + dataLen;
                                        fun(++delayNum);
                                    }
                                });
                                return;
                            }
                            else {
                                child = Decls.UIObjectFactory.newObject(type);
                            }
                        }
                        child._underConstruct = true;
                        if (child.type === ObjectType.Tree || child.type === ObjectType.List || child.type === ObjectType.Button || child.type === ObjectType.Image || child.type === ObjectType.Loader) {
                            delayNum = i;
                            hasAsync = true;
                            // @ts-ignore
                            child.setup_beforeAdd(buffer, curPos).then(() => {
                                hasAsync = false;
                                child.parent = this;
                                this._children.push(child);
                                buffer.position = curPos + dataLen;
                                fun(++delayNum);
                            })
                        } else {
                            child.setup_beforeAdd(buffer, curPos);
                            child.parent = this;
                            this._children.push(child);
                            buffer.position = curPos + dataLen;
                        }
                    }
                    if (hasAsync) {
                        return;
                    }
                    buffer.seek(0, 3);
                    this.relations.setup(buffer, true);

                    buffer.seek(0, 2);
                    buffer.skip(2);

                    for (i = 0; i < childCount; i++) {
                        nextPos = buffer.readShort();
                        nextPos += buffer.position;

                        buffer.seek(buffer.position, 3);
                        this._children[i].relations.setup(buffer, false);

                        buffer.position = nextPos;
                    }

                    buffer.seek(0, 2);
                    buffer.skip(2);

                    for (i = 0; i < childCount; i++) {
                        nextPos = buffer.readShort();
                        nextPos += buffer.position;

                        child = this._children[i];
                        child.setup_afterAdd(buffer, buffer.position);
                        child._underConstruct = false;

                        buffer.position = nextPos;
                    }

                    buffer.seek(0, 4);

                    buffer.skip(2); //customData
                    this.opaque = buffer.readBool();
                    var maskId: number = buffer.readShort();
                    if (maskId != -1) {
                        this.setMask((<Graphics>this.getChildAt(maskId).displayObject), buffer.readBool());
                    }

                    var hitTestId: string = buffer.readS();
                    i1 = buffer.readInt();
                    i2 = buffer.readInt();
                    var hitArea: HitArea;

                    if (hitTestId) {
                        pi = contentItem.owner.getItemById(hitTestId);
                        if (pi && pi.pixelHitTestData)
                            hitArea = new PixelHitTest(pi.pixelHitTestData, i1, i2);
                    }
                    else if (i1 != 0 && i2 != -1) {
                        // hitArea = new ChildHitArea(this.getChildAt(i2));
                    }

                    if (hitArea) {
                        this._displayObject.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
                        this.hitArea = hitArea;
                        // console.log("hitArea", this.hitArea);
                        // this._displayObject.mouseThrough = false;
                        // this._displayObject.hitTestPrior = true;
                    }

                    buffer.seek(0, 5);

                    var transitionCount: number = buffer.readShort();
                    for (i = 0; i < transitionCount; i++) {
                        nextPos = buffer.readShort();
                        nextPos += buffer.position;

                        var trans: Transition = new Transition(this);
                        trans.setup(buffer);
                        this._transitions.push(trans);

                        buffer.position = nextPos;
                    }

                    if (this._transitions.length > 0) {
                        this.displayObject.on(DisplayObjectEvent.ADDTOSTAGE, this.___added, this);
                        this.displayObject.on(DisplayObjectEvent.REMOVEFROMSTAGE, this.___removed, this);
                    }

                    this.applyAllControllers();

                    this._buildingDisplayList = false;
                    this._underConstruct = false;

                    this.buildNativeDisplayList();
                    this.setBoundsChangedFlag();

                    if (contentItem.objectType !== ObjectType.Component || contentItem.name === ObjectName.JoyStick) {
                        this.constructExtension(buffer).then(() => {
                            this.onConstruct();
                            reslove();
                        });
                    } else {
                        // 做适配
                        // const fun1 = (children) => {
                        //     const len = children.length;
                        //     for (let i: number = 0; i < len; i++) {
                        //         const child = children[i];
                        //         const scale = child.parent ? GRoot.dpr : 1;
                        //         if (child.type !== ObjectType.Text) {
                        //             if (child.type === ObjectType.Image || child.type === ObjectType.MovieClip || child.type === ObjectType.Loader) {
                        //                 if (!child["_contentItem"] || !child["_contentItem"].isHighRes) child.setScale(scale, scale);
                        //             }
                        //             else {
                        //                 child.setScale(scale, scale);
                        //             }
                        //         } else {
                        //             (<GBasicTextField>child).setResolution(GRoot.dpr);
                        //         }
                        //     }
                        //     for (let i: number = 0; i < len; i++) {
                        //         const child = children[i];
                        //         child.forceSize();
                        //     }
                        // }
                        // if (this._children) {
                        //     // fun1(this._children);
                        // }
                        this.onConstruct();
                        reslove();
                    }
                }
                fun(0);
            };
            // ===================

            var overflow: number = buffer.readByte();
            if (overflow == OverflowType.Scroll) {
                var savedPos: number = buffer.position;
                buffer.seek(0, 7);
                this.setupScroll(buffer).then(() => {
                    buffer.position = savedPos;
                    fun0();
                });
            } else {
                this.setupOverflow(overflow);
                fun0();
            }
        });
    }

    protected constructExtension(buffer: ByteBuffer): Promise<void> {
        return new Promise((resolve) => {
            resolve();
        });
    }

    protected onConstruct(): void {
        this.constructFromXML(null); //old version
    }

    protected constructFromXML(xml: Object): void {
    }

    public setup_afterAdd(buffer: ByteBuffer, beginPos: number): void {
        super.setup_afterAdd(buffer, beginPos);

        buffer.seek(beginPos, 4);

        var pageController: number = buffer.readShort();
        if (pageController != -1 && this._scrollPane)
            this._scrollPane.pageController = this._parent.getControllerAt(pageController);

        var cnt: number;
        var i: number;

        cnt = buffer.readShort();
        for (i = 0; i < cnt; i++) {
            var cc: Controller = this.getController(buffer.readS());
            var pageId: string = buffer.readS();
            if (cc)
                cc.selectedPageId = pageId;
        }

        if (buffer.version >= 2) {
            cnt = buffer.readShort();
            for (i = 0; i < cnt; i++) {
                var target: string = buffer.readS();
                var propertyId: number = buffer.readShort();
                var value: String = buffer.readS();
                var obj: GObject = this.getChildByPath(target);
                if (obj)
                    obj.setProp(propertyId, value);
            }
        }
        if (this._mask) this.checkMask();
    }

    public checkMask() {
        const mx = this._displayObject.getWorldTransformMatrix();
        let isGraphic: boolean = false;
        if (!this._maskDisplay) {
            this.hitArea = new ChildHitArea(this._mask["$owner"], this._maskReversed);
            const fun = () => {
                if (this._maskDisplay instanceof Phaser.GameObjects.Image) {
                    isGraphic = false;
                } else if (this._maskDisplay instanceof Phaser.GameObjects.Graphics) {
                    isGraphic = true;
                }
                const tx = !isGraphic ? mx.tx + this._maskDisplay.width / 2 : mx.tx;
                const ty = !isGraphic ? mx.ty + this._maskDisplay.height / 2 : mx.ty;
                this._maskDisplay.setPosition(tx * GRoot.dpr, ty * GRoot.dpr);
                if (this._maskReversed) {
                    if (isGraphic) {
                        this._displayObject.setMask(this._maskDisplay.createGeometryMask().setInvertAlpha(true));
                    } else {
                        this._displayObject.setMask(this._maskDisplay.createBitmapMask().setInvertAlpha(true));
                    }
                }
                else {
                    if (isGraphic) {
                        this._displayObject.setMask(this._maskDisplay.createGeometryMask());
                    } else {
                        this._displayObject.setMask(this._maskDisplay.createBitmapMask());
                    }
                }
            }
            if (this._mask instanceof Phaser.GameObjects.Container) {
                this._maskDisplay = this._mask.list[0];
                if (this._maskDisplay instanceof Phaser.GameObjects.Image) {
                    const key = (<Image>this._mask).valueName;
                    this._maskDisplay = this.scene.make.image({ key, frame: "__BASE" });
                    if (!this._maskDisplay) {
                        const fun1 = (cbKey) => {
                            this.scene.textures.off("addtexture", fun1, this);
                            if (cbKey === key || this.scene.textures.get(key)) {
                                if (!this._maskDisplay) {
                                    throw new Error("image scale9grid:" + key + "no load");
                                }
                                if (this._maskDisplay.parentContainer) this._displayObject.remove(this._maskDisplay.parentContainer);
                                fun();
                            }
                        }
                        this.scene.textures.on("addtexture", fun1, this);
                        return;
                    }
                }
            } else if (this._mask instanceof Graphics) {
                this._maskDisplay = this._mask;
            }
            fun();
        } else {
            if (this._maskDisplay instanceof Phaser.GameObjects.Image) {
                isGraphic = false;
            } else if (this._maskDisplay instanceof Phaser.GameObjects.Graphics) {
                isGraphic = true;
            }
            const tx = !isGraphic ? mx.tx + this._maskDisplay.width / 2 : mx.tx;
            const ty = !isGraphic ? mx.ty + this._maskDisplay.height / 2 : mx.ty;
            this._maskDisplay.setPosition(tx * GRoot.dpr, ty * GRoot.dpr);
        }

        if (this._maskDisplay.parentContainer) this._displayObject.remove(this._maskDisplay.parentContainer);

    }


    public setXY(xv: number, yv: number, force: boolean = false): void {
        // 只有owner发生移动才更新mask
        if (this._x != xv || this._y != yv || force) {
            var dx: number = xv - this._x;
            var dy: number = yv - this._y;
            this._x = xv;
            this._y = yv;

            this.handleXYChanged();
            if (this instanceof GGroup)
                (<GGroup>this).moveChildren(dx, dy);

            this.updateGear(1);

            // if (this._parent && !(this._parent instanceof GList)) {
            if (this._parent) {
                this._parent.setBoundsChangedFlag();
                if (this._group)
                    this._group.setBoundsChangedFlag(true);
                this.displayObject.emit(DisplayObjectEvent.XY_CHANGED);
            }

            if (GObject.draggingObject === this && !sUpdateInDragging)
                this.localToGlobalRect(0, 0, this._width, this._height, sGlobalRect);
            const worldMatrix = this.parent && <Phaser.GameObjects.Container>this.parent.displayObject ?
                (<Phaser.GameObjects.Container>this.parent.displayObject).getWorldTransformMatrix()
                : undefined;
            const posX = worldMatrix ? worldMatrix.tx + xv : xv;
            const posY = worldMatrix ? worldMatrix.ty + yv : yv;
            this._children.forEach((obj) => {
                if (obj && obj instanceof GComponent) {
                    const component = (<GComponent>obj);
                    if (component._scrollPane) {
                        component._scrollPane.maskPosChange(posX + component.x, posY + component.y);
                    }
                    const list = component._children;
                    list.forEach((obj) => {
                        if (obj && obj instanceof GComponent) {
                            if (obj._mask) {
                                obj.checkMask();
                            } else if (obj._scrollPane) {
                                obj._scrollPane.maskPosChange(posX, posY);
                            }
                        }
                    });
                }
            });
            if (this._scrollPane) {
                this._scrollPane.maskPosChange(posX, posY);
            }
            if (this._mask) {
                this.checkMask();
            }
        }
    }

    protected handleScaleChanged(): void {
        if (this._children) {
            const len = this._children.length;
            for (let i: number = 0; i < len; i++) {
                const child = this._children[i];
                if (child.type === ObjectType.Text) {
                    (<GBasicTextField>child).setScale(1, 1);
                }
                child.displayObject.emit(DisplayObjectEvent.SIZE_CHANGED, this);
            }
        }
        super.handleScaleChanged();
    }

    protected ___added(): void {
        var cnt: number = this._transitions.length;
        for (var i: number = 0; i < cnt; ++i) {
            this._transitions[i].onOwnerAddedToStage();
        }
    }

    protected ___removed(): void {
        var cnt: number = this._transitions.length;
        for (var i: number = 0; i < cnt; ++i) {
            this._transitions[i].onOwnerRemovedFromStage();
        }
    }
}
