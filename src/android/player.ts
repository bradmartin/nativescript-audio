import * as app from 'tns-core-modules/application';
import * as utils from 'tns-core-modules/utils/utils';
import * as fs from 'tns-core-modules/file-system';
import * as enums from 'tns-core-modules/ui/enums';
import { Observable } from 'tns-core-modules/data/observable';
import { isString } from 'tns-core-modules/utils/types';
import { isFileOrResourcePath } from 'tns-core-modules/utils/utils';
import {
  TNSPlayerI,
  TNS_Player_Log,
  isStringUrl,
  resolveAudioFilePath,
  TNSPlayerUtil
} from '../common';
import { AudioPlayerOptions, AudioPlayerEvents } from '../options';

export class TNSPlayer implements TNSPlayerI {
  private _player: android.media.MediaPlayer;
  private _mAudioFocusGranted: boolean = false;
  private _lastPlayerVolume; // ref to the last volume setting so we can reset after ducking
  private _events: Observable;

  constructor() {
    // request audio focus, this will setup the onAudioFocusChangeListener
    this._mAudioFocusGranted = this._requestAudioFocus();
    TNS_Player_Log('_mAudioFocusGranted', this._mAudioFocusGranted);
  }

  public get events() {
    if (!this._events) {
      this._events = new Observable();
    }
    return this._events;
  }

  get android(): any {
    return this._player;
  }

  set debug(value: boolean) {
    TNSPlayerUtil.debug = value;
  }

  get volume(): number {
    // TODO: find better way to get individual player volume
    const ctx = this._getAndroidContext();
    const mgr = ctx.getSystemService(android.content.Context.AUDIO_SERVICE);
    return mgr.getStreamVolume(android.media.AudioManager.STREAM_MUSIC);
  }

  set volume(value: number) {
    if (this._player && value >= 0) {
      this._player.setVolume(value, value);
    }
  }

  public get duration(): number {
    if (this._player) {
      return this._player.getDuration();
    } else {
      return 0;
    }
  }

  get currentTime(): number {
    return this._player ? this._player.getCurrentPosition() : 0;
  }

  /**
   * Initializes the player with options, will not start playing audio.
   * @param options [AudioPlayerOptions]
   */
  public initFromFile(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      options.autoPlay = false;
      this.playFromFile(options).then(resolve, reject);
    });
  }

  public playFromFile(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (options.autoPlay !== false) {
          options.autoPlay = true;
        }

        const audioPath = resolveAudioFilePath(options.audioFile);
        TNS_Player_Log('audioPath', audioPath);

        if (!this._player) {
          TNS_Player_Log(
            'android mediaPlayer is not initialized, creating new instance'
          );
          this._player = new android.media.MediaPlayer();
        }

        // request audio focus, this will setup the onAudioFocusChangeListener
        this._mAudioFocusGranted = this._requestAudioFocus();
        TNS_Player_Log('_mAudioFocusGranted', this._mAudioFocusGranted);

        this._player.setAudioStreamType(
          android.media.AudioManager.STREAM_MUSIC
        );

        TNS_Player_Log('resetting mediaPlayer...');
        this._player.reset();
        TNS_Player_Log('setting datasource', audioPath);
        this._player.setDataSource(audioPath);

        // check if local file or remote - local then `prepare` is okay https://developer.android.com/reference/android/media/MediaPlayer.html#prepare()
        if (isFileOrResourcePath(audioPath)) {
          TNS_Player_Log('preparing mediaPlayer...');
          this._player.prepare();
        } else {
          TNS_Player_Log('preparing mediaPlayer async...');
          this._player.prepareAsync();
        }

        // On Complete
        if (options.completeCallback) {
          this._player.setOnCompletionListener(
            new android.media.MediaPlayer.OnCompletionListener({
              onCompletion: mp => {
                if (options.loop === true) {
                  mp.seekTo(5);
                  mp.start();
                }

                options.completeCallback({ player: mp });
              }
            })
          );
        }

        // On Error
        if (options.errorCallback) {
          this._player.setOnErrorListener(
            new android.media.MediaPlayer.OnErrorListener({
              onError: (player: any, error: number, extra: number) => {
                this._player.reset();
                TNS_Player_Log('errorCallback', error);
                options.errorCallback({ player, error, extra });
                return true;
              }
            })
          );
        }

        // On Info
        if (options.infoCallback) {
          this._player.setOnInfoListener(
            new android.media.MediaPlayer.OnInfoListener({
              onInfo: (player: any, info: number, extra: number) => {
                TNS_Player_Log('infoCallback', info);
                options.infoCallback({ player, info, extra });
                return true;
              }
            })
          );
        }

        // On Prepared
        this._player.setOnPreparedListener(
          new android.media.MediaPlayer.OnPreparedListener({
            onPrepared: mp => {
              if (options.autoPlay) {
                TNS_Player_Log('options.autoPlay', options.autoPlay);
                this.play();
              }
              resolve();
            }
          })
        );
      } catch (ex) {
        TNS_Player_Log('playFromFile error', ex);
        reject(ex);
      }
    });
  }

  /**
   * Initializes the player with options, will not start playing audio.
   * @param options
   */
  public initFromUrl(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      options.autoPlay = false;
      this.playFromUrl(options).then(resolve, reject);
    });
  }

  public playFromUrl(options: AudioPlayerOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve(this.playFromFile(options));
    });
  }

  public pause(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player && this._player.isPlaying()) {
          TNS_Player_Log('pausing player');
          this._player.pause();
          this._sendEvent(AudioPlayerEvents.paused);
        }
        resolve(true);
      } catch (ex) {
        TNS_Player_Log('pause error', ex);
        reject(ex);
      }
    });
  }

  public play(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player && !this._player.isPlaying()) {
          this._sendEvent(AudioPlayerEvents.started);
          // set volume controls
          // https://developer.android.com/reference/android/app/Activity.html#setVolumeControlStream(int)
          app.android.foregroundActivity.setVolumeControlStream(
            android.media.AudioManager.STREAM_MUSIC
          );

          // register the receiver so when calls or another app takes main audio focus the player pauses
          app.android.registerBroadcastReceiver(
            android.media.AudioManager.ACTION_AUDIO_BECOMING_NOISY,
            (
              context: android.content.Context,
              intent: android.content.Intent
            ) => {
              TNS_Player_Log('ACTION_AUDIO_BECOMING_NOISY onReceiveCallback');
              TNS_Player_Log('intent', intent);
              this.pause();
            }
          );

          this._player.start();
        }
        resolve(true);
      } catch (ex) {
        TNS_Player_Log('Error trying to play audio.', ex);
        reject(ex);
      }
    });
  }

  public resume(): void {
    if (this._player) {
      TNS_Player_Log('resume');
      this._player.start();
      this._sendEvent(AudioPlayerEvents.started);
    }
  }

  public seekTo(time: number): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player) {
          time = time * 1000;
          TNS_Player_Log('seekTo seconds', time);
          this._player.seekTo(time);
          this._sendEvent(AudioPlayerEvents.seek);
        }
        resolve(true);
      } catch (ex) {
        TNS_Player_Log('seekTo error', ex);
        reject(ex);
      }
    });
  }

  public changePlayerSpeed(speed) {
    // this checks on API 23 and up
    if (android.os.Build.VERSION.SDK_INT >= 23 && this.play) {
      TNS_Player_Log('setting the mediaPlayer playback speed', speed);
      if (this._player.isPlaying()) {
        (this._player as any).setPlaybackParams(
          (this._player as any).getPlaybackParams().setSpeed(speed)
        );
      } else {
        (this._player as any).setPlaybackParams(
          (this._player as any).getPlaybackParams().setSpeed(speed)
        );
        this._player.pause();
      }
    } else {
      TNS_Player_Log(
        'Android device API is not 23+. Cannot set the playbackRate on lower Android APIs.'
      );
    }
  }

  public dispose(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._player) {
          TNS_Player_Log('disposing of mediaPlayer instance', this._player);
          this._player.stop();
          this._player.reset();
          // this._player.release();

          TNS_Player_Log(
            'unregisterBroadcastReceiver ACTION_AUDIO_BECOMING_NOISY...'
          );
          // unregister broadcast receiver
          app.android.unregisterBroadcastReceiver(
            android.media.AudioManager.ACTION_AUDIO_BECOMING_NOISY
          );

          TNS_Player_Log('abandoning audio focus...');
          this._abandonAudioFocus();
        }
        resolve();
      } catch (ex) {
        TNS_Player_Log('dispose error', ex);
        reject(ex);
      }
    });
  }

  public isAudioPlaying(): boolean {
    if (this._player) {
      return this._player.isPlaying();
    } else {
      return false;
    }
  }

  public getAudioTrackDuration(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const duration = this._player ? this._player.getDuration() : 0;
        TNS_Player_Log('audio track duration', duration);
        resolve(duration.toString());
      } catch (ex) {
        TNS_Player_Log('getAudioTrackDuration error', ex);
        reject(ex);
      }
    });
  }

  /**
   * Notify events by name and optionally pass data
   */
  private _sendEvent(eventName: string, data?: any) {
    if (this.events) {
      this.events.notify(<any>{
        eventName,
        object: this,
        data: data
      });
    }
  }

  /**
   * Helper method to ensure audio focus.
   */
  private _requestAudioFocus(): boolean {
    let result = false;
    if (!this._mAudioFocusGranted) {
      const ctx = this._getAndroidContext();
      const am = ctx.getSystemService(android.content.Context.AUDIO_SERVICE);
      // Request audio focus for play back
      const focusResult = am.requestAudioFocus(
        this._mOnAudioFocusChangeListener,
        android.media.AudioManager.STREAM_MUSIC,
        android.media.AudioManager.AUDIOFOCUS_GAIN
      );

      if (
        focusResult === android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      ) {
        result = true;
      } else {
        TNS_Player_Log('Failed to get audio focus.');
        result = false;
      }
    }
    return result;
  }

  private _abandonAudioFocus(): void {
    const ctx = this._getAndroidContext();
    const am = ctx.getSystemService(android.content.Context.AUDIO_SERVICE);
    const result = am.abandonAudioFocus(this._mOnAudioFocusChangeListener);
    if (result === android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      this._mAudioFocusGranted = false;
    } else {
      TNS_Player_Log('Failed to abandon audio focus.');
    }
    this._mOnAudioFocusChangeListener = null;
  }

  private _getAndroidContext() {
    let ctx = app.android.context;
    if (!ctx) {
      ctx = app.getNativeApplication().getApplicationContext();
    }

    if (ctx === null) {
      setTimeout(() => {
        this._getAndroidContext();
      }, 200);

      return;
    }

    return ctx;
  }

  private _mOnAudioFocusChangeListener = new android.media.AudioManager.OnAudioFocusChangeListener(
    {
      onAudioFocusChange: (focusChange: number) => {
        switch (focusChange) {
          case android.media.AudioManager.AUDIOFOCUS_GAIN:
            TNS_Player_Log('AUDIOFOCUS_GAIN');
            // Set volume level to desired levels
            TNS_Player_Log('this._lastPlayerVolume', this._lastPlayerVolume);
            // if last volume more than 10 just set to 1.0 float
            if (this._lastPlayerVolume && this._lastPlayerVolume >= 10) {
              this.volume = 1.0;
            } else if (this._lastPlayerVolume) {
              this.volume = parseFloat(
                '0.' + this._lastPlayerVolume.toString()
              );
            }

            this.resume();
            break;
          case android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT:
            TNS_Player_Log('AUDIOFOCUS_GAIN_TRANSIENT');
            // You have audio focus for a short time
            break;
          case android.media.AudioManager.AUDIOFOCUS_LOSS:
            TNS_Player_Log('AUDIOFOCUS_LOSS');
            this.pause();
            break;
          case android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            TNS_Player_Log('AUDIOFOCUS_LOSS_TRANSIENT');
            // Temporary loss of audio focus - expect to get it back - you can keep your resources around
            this.pause();
            break;
          case android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
            TNS_Player_Log('AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK');
            // Lower the volume, keep playing
            this._lastPlayerVolume = this.volume;
            TNS_Player_Log('this._lastPlayerVolume', this._lastPlayerVolume);
            this.volume = 0.2;
            break;
        }
      }
    }
  );
}
