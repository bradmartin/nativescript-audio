import { Color } from 'tns-core-modules/color';
import { Page } from 'tns-core-modules/ui/page';
import { AudioDemo } from './main-view-model';

export function pageLoaded(args) {
  const page = args.object as Page;
  page.bindingContext = new AudioDemo(page);
  page.androidStatusBarBackground = new Color('#32408f');
}
