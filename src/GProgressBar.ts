import { ByteBuffer } from './utils/ByteBuffer';
import { GLoader } from './GLoader';
import { GImage } from './GImage';
import { ToolSet } from './utils/ToolSet';
import { EaseType } from './tween/EaseType';
import { GTweener } from './tween/GTweener';
import { ProgressTitleType, ObjectPropID, FillMethod } from './FieldTypes';
import { GObject } from './GObject';
import { GComponent } from "./GComponent";
import { GTween } from './tween/GTween';
import { Image } from '.';

export class GProgressBar extends GComponent {
    private _min: number = 0;
    private _max: number = 0;
    private _value: number = 0;
    private _titleType: number;
    private _reverse: boolean;

    private _titleObject: GObject;
    private _aniObject: GObject;
    private _barObjectH: GObject;
    private _barObjectV: GObject;
    private _barMaxWidth: number = 0;
    private _barMaxHeight: number = 0;
    private _barMaxWidthDelta: number = 0;
    private _barMaxHeightDelta: number = 0;
    private _barStartX: number = 0;
    private _barStartY: number = 0;

    constructor(scene: Phaser.Scene, type) {
        super(scene, type);

        this._titleType = ProgressTitleType.Percent;
        this._value = 50;
        this._max = 100;
    }

    public get titleType(): number {
        return this._titleType;
    }

    public set titleType(value: number) {
        if (this._titleType != value) {
            this._titleType = value;
            this.update(value);
        }
    }

    public get min(): number {
        return this._min;
    }

    public set min(value: number) {
        if (this._min != value) {
            this._min = value;
            this.update(this._value);
        }
    }

    public get max(): number {
        return this._max;
    }

    public set max(value: number) {
        if (this._max != value) {
            this._max = value;
            this.update(this._value);
        }
    }

    public get value(): number {
        return this._value;
    }

    public set value(value: number) {

        if (this._value != value) {
            GTween.kill(this, false, this.update);
            this._value = value;
            this.update(value);
        }
    }

    public tweenValue(value: number, duration: number): GTweener {
        var oldValule: number;

        var tweener: GTweener = GTween.getTween(this, this.update);
        if (tweener) {
            oldValule = tweener.value.x;
            tweener.kill();
        }
        else
            oldValule = this._value;

        this._value = value;
        return GTween.to(oldValule, this._value, duration).setTarget(this, this.update).setEase(EaseType.Linear);
    }

    public update(newValue: number): void {
        var percent: number = ToolSet.clamp01((newValue - this._min) / (this._max - this._min));
        if (this._titleObject) {
            switch (this._titleType) {
                case ProgressTitleType.Percent:
                    this._titleObject.text = Math.floor(percent * 100) + "%";
                    break;

                case ProgressTitleType.ValueAndMax:
                    this._titleObject.text = Math.floor(newValue) + "/" + Math.floor(this._max);
                    break;

                case ProgressTitleType.Value:
                    this._titleObject.text = "" + Math.floor(newValue);
                    break;

                case ProgressTitleType.Max:
                    this._titleObject.text = "" + Math.floor(this._max);
                    break;
            }
        }

        var fullWidth: number = this.width - this._barMaxWidthDelta;
        var fullHeight: number = this.height - this._barMaxHeightDelta;
        if (!this._reverse) {
            if (this._barObjectH) {
                const img = (<Image>this._barObjectH.displayObject).curImage;
                if (!this.setFillAmount(this._barObjectH, percent)) {
                    if (this._barObjectH.displayObject instanceof Image) {
                        if ((<Image>this._barObjectH.displayObject).scale9Grid) {
                            this._barObjectH.width = Math.round(fullWidth * percent);
                        } else {
                            // 如果要调整image的属性，满足条件 curImage的width必须大于等于进度条max尺寸(scale，width，height这些属性在编辑器中可调整的属性都可以用来调整实际进度条的尺寸)，否则步进显示不正常
                            if (img.width < this._barObjectH.initWidth) {
                                // 临时容错方式
                                if (img.scaleX >= (this._barObjectH.initWidth / img.width)) img.scaleX = 1;
                                img.displayWidth = Math.round(fullWidth * percent);
                            } else {
                                // 默认处理方式
                                img.setCrop(new Phaser.Geom.Rectangle(0, 0, Math.round(fullWidth * percent), this._barObjectH.initHeight));
                            }
                        }
                    } else {
                        this._barObjectH.resizeMask(Math.round(fullWidth * percent), this._barObjectH.initHeight);
                    }
                }
            }
            if (this._barObjectV) {
                const img = (<Image>this._barObjectV.displayObject).curImage;
                if (!this.setFillAmount(this._barObjectV, percent)) {
                    if (this._barObjectV.displayObject instanceof Image) {
                        if ((<Image>this._barObjectV.displayObject).scale9Grid) {
                            this._barObjectV.height = Math.round(fullHeight * percent);
                        } else {
                            // 如果要调整image的属性，满足条件 curImage的width必须大于等于进度条max尺寸(scale，width，height这些属性在编辑器中可调整的属性都可以用来调整实际进度条的尺寸)，否则步进显示不正常
                            if (img.height < this._barObjectV.initHeight) {
                                // 临时容错方式
                                if (img.scaleY >= (this._barObjectV.initHeight / img.height)) img.scaleY = 1;
                                img.displayHeight = Math.round(fullHeight * percent);
                            } else {
                                // 默认处理方式
                                img.setCrop(new Phaser.Geom.Rectangle(0, 0, this._barObjectV.initWidth, Math.round(fullHeight * percent)));
                            }
                        }
                    } else {
                        this._barObjectV.resizeMask(this._barObjectV._rawWidth, Math.round(fullHeight * percent));
                    }
                }
            }
        }
        else {
            if (this._barObjectH) {
                const img = (<Image>this._barObjectH.displayObject).curImage;
                if (!this.setFillAmount(this._barObjectH, 1 - percent)) {
                    if (this._barObjectH.displayObject instanceof Image) {
                        if ((<Image>this._barObjectH.displayObject).scale9Grid) {
                            this._barObjectH.width = Math.round(fullWidth * percent);
                        } else {
                            // 如果要调整image的属性，满足条件 curImage的width必须大于等于进度条max尺寸(scale，width，height这些属性在编辑器中可调整的属性都可以用来调整实际进度条的尺寸)，否则步进显示不正常
                            if (img.width < this._barObjectH.initWidth) {
                                // 临时容错方式
                                if (img.scaleX >= (this._barObjectH.initWidth / img.width)) img.scaleX = 1;
                                img.displayWidth = Math.round(fullWidth * percent);
                            } else {
                                // 默认处理方式
                                img.setCrop(new Phaser.Geom.Rectangle(0, 0, Math.round(fullWidth * percent), this._barObjectH.initHeight));
                            }
                        }
                        this._barObjectH.x = this._barStartX + (fullWidth - this._barObjectH.width);
                    } else {
                        this._barObjectH.resizeMask(Math.round(fullWidth * percent), this._barObjectH._rawHeight);
                    }
                }

            }
            if (this._barObjectV) {
                const img = (<Image>this._barObjectV.displayObject).curImage;
                if (!this.setFillAmount(this._barObjectV, 1 - percent)) {
                    if (this._barObjectV.displayObject instanceof Image) {
                        if ((<Image>this._barObjectV.displayObject).scale9Grid) {
                            this._barObjectV.height = Math.round(fullHeight * percent);
                        } else {
                            // 如果要调整image的属性，满足条件 curImage的width必须大于等于进度条max尺寸(scale，width，height这些属性在编辑器中可调整的属性都可以用来调整实际进度条的尺寸)，否则步进显示不正常
                            if (img.height < this._barObjectV.initHeight) {
                                // 临时容错方式
                                if (img.scaleY >= (this._barObjectV.initHeight / img.height)) img.scaleY = 1;
                                img.displayHeight = Math.round(fullHeight * percent);
                            } else {
                                // 默认处理方式
                                img.setCrop(new Phaser.Geom.Rectangle(0, 0, this._barObjectV.initWidth, Math.round(fullHeight * percent)));
                            }
                        }
                        this._barObjectV.y = this._barStartY + (fullHeight - this._barObjectV.height);
                    } else {
                        this._barObjectV.resizeMask(this._barObjectV._rawWidth, Math.round(fullHeight * percent));
                    }
                }
            }
        }
        if (this._aniObject)
            this._aniObject.setProp(ObjectPropID.Frame, Math.floor(percent * 100));
    }

    private setFillAmount(bar: GObject, percent: number): boolean {
        if (((bar instanceof GImage) || (bar instanceof GLoader)) && bar.fillMethod != FillMethod.None) {
            bar.fillAmount = percent;
            return true;
        }
        else
            return false;
    }

    protected constructExtension(buffer: ByteBuffer): Promise<void> {
        return new Promise((resolve, reject) => {
            buffer.seek(0, 6);

            this._titleType = buffer.readByte();
            this._reverse = buffer.readBool();

            this._titleObject = this.getChild("title");
            this._barObjectH = this.getChild("bar");
            this._barObjectV = this.getChild("bar_v");
            this._aniObject = this.getChild("ani");

            if (this._barObjectH) {
                this._barMaxWidth = this._barObjectH.initWidth;
                this._barMaxWidthDelta = this.width - this._barMaxWidth;
                this._barStartX = this._barObjectH.x;
            }
            if (this._barObjectV) {
                this._barMaxHeight = this._barObjectV.initHeight;
                this._barMaxHeightDelta = this.height - this._barMaxHeight;
                this._barStartY = this._barObjectV.y;
            }
            resolve();
        });
    }

    protected handleSizeChanged(): void {
        super.handleSizeChanged();

        if (this._barObjectH)
            this._barMaxWidth = this.width - this._barMaxWidthDelta;
        if (this._barObjectV)
            this._barMaxHeight = this.height - this._barMaxHeightDelta;
        if (!this._underConstruct)
            this.update(this._value);
    }

    public setup_afterAdd(buffer: ByteBuffer, beginPos: number): void {
        super.setup_afterAdd(buffer, beginPos);

        if (!buffer.seek(beginPos, 6)) {
            this.update(this._value);
            return;
        }

        if (buffer.readByte() != this.packageItem.objectType) {
            this.update(this._value);
            return;
        }

        this._value = buffer.readInt();
        this._max = buffer.readInt();
        if (buffer.version >= 2)
            this._min = buffer.readInt();

        this.update(this._value);
    }
}