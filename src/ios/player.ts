import * as app from 'tns-core-modules/application';
import * as utils from 'tns-core-modules/utils/utils';
import { isString } from 'tns-core-modules/utils/types';
import { knownFolders, path } from 'tns-core-modules/file-system';
import { TNSPlayerI, TNSPlayerUtil, TNS_Player_Log } from '../common';
import { AudioPlayerOptions, AudioPlayerEvents } from '../options';

export class TNSPlayer extends NSObject implements TNSPlayerI {
  public static ObjCProtocols = [AVAudioPlayerDelegate];
  private _player: AVAudioPlayer;
  private _task: NSURLSessionDataTask;
  private _completeCallback: any;
  private _errorCallback: any;
  private _infoCallback: any;

  get ios(): any {
    return this._player;
  }

  set debug(value: boolean) {
    TNSPlayerUtil.debug = value;
  }

  public get volume(): number {
    return this._player ? this._player.volume : 0;
  }

  public set volume(value: number) {
    if (this._player && value >= 0) {
      this._player.volume = value;
    }
  }

  public get duration() {
    if (this._player) {
      return this._player.duration;
    } else {
      return 0;
    }
  }

  get currentTime(): number {
    return this._player ? this._player.currentTime : 0;
  }

  public initFromFile(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      // init only
      options.autoPlay = false;
      this.playFromFile(options).then(resolve, reject);
    });
  }

  public playFromFile(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      // only if not explicitly set, default to true
      if (options.autoPlay !== false) {
        options.autoPlay = true;
      }

      try {
        let fileName = isString(options.audioFile)
          ? options.audioFile.trim()
          : '';
        if (fileName.indexOf('~/') === 0) {
          fileName = path.join(
            knownFolders.currentApp().path,
            fileName.replace('~/', '')
          );
        }
        TNS_Player_Log('fileName', fileName);

        this._completeCallback = options.completeCallback;
        this._errorCallback = options.errorCallback;
        this._infoCallback = options.infoCallback;

        const audioSession = AVAudioSession.sharedInstance();
        const output = audioSession.currentRoute.outputs.lastObject.portType;
        TNS_Player_Log('output', output);

        if (output.match(/Receiver/)) {
          try {
            audioSession.setCategoryError(AVAudioSessionCategoryPlayAndRecord);
            audioSession.overrideOutputAudioPortError(
              AVAudioSessionPortOverride.Speaker
            );
            audioSession.setActiveError(true);
            TNS_Player_Log('audioSession category set and active');
          } catch (err) {
            TNS_Player_Log('setting audioSession category failed');
          }
        }

        const errorRef = new interop.Reference();
        this._player = AVAudioPlayer.alloc().initWithContentsOfURLError(
          NSURL.fileURLWithPath(fileName),
          errorRef
        );
        if (errorRef && errorRef.value) {
          reject(errorRef.value);
          return;
        } else if (this._player) {
          this._player.delegate = this;

          // enableRate to change playback speed
          this._player.enableRate = true;

          TNS_Player_Log('this._player', this._player);

          if (options.metering) {
            TNS_Player_Log('enabling metering...');
            this._player.meteringEnabled = true;
          }

          if (options.loop) {
            this._player.numberOfLoops = -1;
          }

          if (options.autoPlay) {
            this._player.play();
          }

          resolve();
        } else {
          reject();
        }
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        reject(ex);
      }
    });
  }

  public initFromUrl(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      // init only
      options.autoPlay = false;
      this.playFromUrl(options).then(resolve, reject);
    });
  }

  public playFromUrl(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      // only if not explicitly set, default to true
      if (options.autoPlay !== false) {
        options.autoPlay = true;
      }

      try {
        const sharedSession = utils.ios.getter(
          NSURLSession,
          NSURLSession.sharedSession
        );

        this._task = sharedSession.dataTaskWithURLCompletionHandler(
          NSURL.URLWithString(options.audioFile),
          (data, response, error) => {
            if (error !== null) {
              if (this._errorCallback) {
                this._errorCallback({ error });
              }

              reject();
            }

            this._completeCallback = options.completeCallback;
            this._errorCallback = options.errorCallback;
            this._infoCallback = options.infoCallback;

            const audioSession = AVAudioSession.sharedInstance();
            const output =
              audioSession.currentRoute.outputs.lastObject.portType;

            if (output.match(/Receiver/)) {
              try {
                audioSession.setCategoryError(
                  AVAudioSessionCategoryPlayAndRecord
                );
                audioSession.overrideOutputAudioPortError(
                  AVAudioSessionPortOverride.Speaker
                );
                audioSession.setActiveError(true);
                TNS_Player_Log('audioSession category set and active');
              } catch (err) {
                TNS_Player_Log('setting audioSession category failed');
              }
            }

            const errorRef = new interop.Reference();
            this._player = AVAudioPlayer.alloc().initWithDataError(
              data,
              errorRef
            );
            if (errorRef && errorRef.value) {
              reject(errorRef.value);
              return;
            } else if (this._player) {
              this._player.delegate = this;
              TNS_Player_Log('this._player', this._player);

              // enableRate to change playback speed
              this._player.enableRate = true;

              this._player.numberOfLoops = options.loop ? -1 : 0;

              if (options.metering) {
                TNS_Player_Log('enabling metering...');
                this._player.meteringEnabled = true;
              }

              if (options.autoPlay) {
                this._player.play();
              }

              resolve();
            } else {
              reject();
            }
          }
        );

        this._task.resume();
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        reject(ex);
      }
    });
  }

  public pause(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player && this._player.playing) {
          TNS_Player_Log('pausing player...');
          this._player.pause();
          resolve(true);
        }
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        TNS_Player_Log('pause error', ex);
        reject(ex);
      }
    });
  }

  public play(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.isAudioPlaying()) {
          TNS_Player_Log('player play...');
          this._player.play();
          resolve(true);
        }
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        TNS_Player_Log('play error', ex);
        reject(ex);
      }
    });
  }

  public resume(): void {
    if (this._player) {
      TNS_Player_Log('resuming player...');
      this._player.play();
    }
  }

  public playAtTime(time: number): void {
    if (this._player) {
      TNS_Player_Log('playAtTime', time);
      this._player.playAtTime(time);
    }
  }

  public seekTo(time: number): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player) {
          TNS_Player_Log('seekTo', time);
          this._player.currentTime = time;
          resolve(true);
        }
      } catch (ex) {
        TNS_Player_Log('seekTo error', ex);
        reject(ex);
      }
    });
  }

  public dispose(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        TNS_Player_Log('disposing TNSPlayer...');
        if (this._player && this.isAudioPlaying()) {
          this._player.stop();
        }
        this._reset();
        resolve();
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        TNS_Player_Log('dispose error', ex);
        reject(ex);
      }
    });
  }

  public isAudioPlaying(): boolean {
    return this._player ? this._player.playing : false;
  }

  public getAudioTrackDuration(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const duration = this._player ? this._player.duration : 0;
        TNS_Player_Log('audio track duration', duration);
        resolve(duration.toString());
      } catch (ex) {
        if (this._errorCallback) {
          this._errorCallback({ ex });
        }
        TNS_Player_Log('getAudioTrackDuration error', ex);
        reject(ex);
      }
    });
  }

  public changePlayerSpeed(speed) {
    if (this._player && speed) {
      // make sure speed is a number/float
      if (typeof speed === 'string') {
        speed = parseFloat(speed);
      }
      this._player.rate = speed;
    }
  }

  public audioPlayerDidFinishPlayingSuccessfully(player?: any, flag?: boolean) {
    if (flag && this._completeCallback) {
      this._completeCallback({ player, flag });
    } else if (!flag && this._errorCallback) {
      this._errorCallback({ player, flag });
    }
  }

  public audioPlayerDecodeErrorDidOccurError(player: any, error: NSError) {
    if (this._errorCallback) {
      this._errorCallback({ player, error });
    }
  }

  private _reset() {
    if (this._player) {
      this._player = undefined;
    }
    if (this._task) {
      this._task.cancel();
      this._task = undefined;
    }
  }
}
