import { GJoyStick } from './GJoyStick';
import { GMovieClip } from './GMovieClip';
import { GComponent } from "./GComponent";
import { GList } from './GList';
import { GGroup } from './GGroup';
import { GComboBox } from './GComboBox';
import { GScrollBar } from './GScrollBar';
import { GSlider } from './GSlider';
import { GProgressBar } from './GProgressBar';
import { GLabel } from './GLabel';
import { GButton } from './GButton';
import { GImage } from './GImage';
import { ObjectType, PackageItemType } from './FieldTypes';
import { GObject } from './GObject';
import { PackageItem } from './PackageItem';
import { Decls, UIPackage } from './UIPackage';
import { GLoader } from './GLoader';
import { GTree } from './GTree';
import { GRoot } from "./GRoot";
import { GBasicTextField } from "./GBasicTextField";
import { GGraph } from "./GGraph";
import { GRichTextField, GTextInput, ObjectName } from '.';

export class UIObjectFactory {
    public static extensions: { [index: string]: new () => GComponent } = {};
    public static loaderType: new () => GLoader;

    public constructor() {
    }

    public static setExtension(url: string, type: new () => GComponent): void {
        if (url == null)
            throw "Invaild url: " + url;

        var pi: PackageItem = UIPackage.getItemByURL(url);
        if (pi)
            pi.extensionType = type;

        UIObjectFactory.extensions[url] = type;
    }

    public static setPackageItemExtension(url: string, type: new () => GComponent): void {
        UIObjectFactory.setExtension(url, type);
    }

    public static setLoaderExtension(type: new () => GLoader): void {
        UIObjectFactory.loaderType = type;
    }

    public static resolveExtension(pi: PackageItem): void {
        var extensionType = UIObjectFactory.extensions["ui://" + pi.owner.id + pi.id];
        if (!extensionType)
            extensionType = UIObjectFactory.extensions["ui://" + pi.owner.name + "/" + pi.name];
        if (extensionType)
            pi.extensionType = extensionType;
    }

    public static newObject(type: number | PackageItem, userClass?: new () => GObject): GObject {
        var obj: GObject;

        if (typeof type === 'number') {
            switch (type) {
                case ObjectType.Image:
                    return new GImage(GRoot.inst.scene, type);

                case ObjectType.MovieClip:
                    return new GMovieClip(GRoot.inst.scene, type);

                case ObjectType.Component:
                    return new GComponent(GRoot.inst.scene, type);

                case ObjectType.Text:
                    return new GBasicTextField(GRoot.inst.scene, type);

                case ObjectType.RichText:
                    return new GRichTextField(GRoot.inst.scene, type);

                case ObjectType.InputText:
                    return new GTextInput(GRoot.inst.scene, type);
                case ObjectType.Group:
                    return new GGroup(GRoot.inst.scene, type);
                case ObjectType.List:
                    return new GList(GRoot.inst.scene, type);
                case ObjectType.Graph:
                    return new GGraph(GRoot.inst.scene, type);
                case ObjectType.Loader:
                    // test
                    // if (UIObjectFactory.loaderType)
                    //     return new UIObjectFactory.loaderType();
                    // else
                    return new GLoader(GRoot.inst.scene, type);
                case ObjectType.Button:
                    return new GButton(GRoot.inst.scene, type);
                case ObjectType.Label:
                    return new GLabel(GRoot.inst.scene, type);
                case ObjectType.ProgressBar:
                    return new GProgressBar(GRoot.inst.scene, type);
                case ObjectType.Slider:
                    return new GSlider(GRoot.inst.scene, type);
                case ObjectType.ScrollBar:
                    return new GScrollBar(GRoot.inst.scene, type);
                case ObjectType.ComboBox:
                    return new GComboBox(GRoot.inst.scene, type);
                case ObjectType.Tree:
                    return new GTree(GRoot.inst.scene, type);
                case ObjectType.JoyStick:
                    return new GJoyStick(GRoot.inst.scene, type);
                default:
                    return null;
            }
        }
        else {
            if (type.type == PackageItemType.Component) {
                if (userClass)
                    obj = new userClass();
                else if (type.extensionType)
                    obj = new type.extensionType();
                else if (type.name === ObjectName.JoyStick)
                     // 不改编辑器情况下，新增joysitck
                    obj = UIObjectFactory.newObject(ObjectType.JoyStick);
                else
                    obj = UIObjectFactory.newObject(type.objectType);
            }
            else {
                
                if (type.name === ObjectName.JoyStick) {
                    obj = UIObjectFactory.newObject(ObjectType.JoyStick);
                } else {
                    obj = UIObjectFactory.newObject(type.objectType);
                }
            }

            if (obj)
                obj.packageItem = type;
        }

        return obj;
    }
}
Decls.UIObjectFactory = UIObjectFactory;
