import '../async-await';
import * as permissions from 'nativescript-permissions';
import * as app from 'tns-core-modules/application';
import { TNSRecordI, TNSRecorderUtil, TNS_Recorder_Log } from '../common';
import { AudioRecorderOptions } from '../options';

export class TNSRecorder implements TNSRecordI {
  private _recorder: any;

  get android() {
    return this._recorder;
  }

  set debug(value: boolean) {
    TNSRecorderUtil.debug = value;
  }

  public static CAN_RECORD(): boolean {
    const pManager = app.android.context.getPackageManager();
    const canRecord = pManager.hasSystemFeature(
      android.content.pm.PackageManager.FEATURE_MICROPHONE
    );
    if (canRecord) {
      return true;
    } else {
      return false;
    }
  }

  public requestRecordPermission(explanation = '') {
    return new Promise(async (resolve, reject) => {
      try {
        await permissions
          .requestPermission((android as any).Manifest.permission.RECORD_AUDIO)
          .catch(err => {
            TNS_Recorder_Log('Error getting RECORD_AUDIO permission.', err);
            reject(err);
          });
        resolve();
      } catch (error) {
        TNS_Recorder_Log('requestRecordPermission error', error);
        reject(error);
      }
    });
  }

  public hasRecordPermission() {
    const permission = permissions.hasPermission(
      (android as any).Manifest.permission.RECORD_AUDIO
    );
    return !0 === permission ? !0 : !1;
  }

  public start(options: AudioRecorderOptions): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // bake the permission into this so the dev doesn't have to call it
        await this.requestRecordPermission().catch(err => {
          console.log(err);
          reject('Permission to record audio is not granted.');
        });

        if (this._recorder) {
          // reset for reuse
          this._recorder.reset();
        } else {
          TNS_Recorder_Log(
            'recorder is not initialized, creating new instance of android MediaRecorder.'
          );
          this._recorder = new android.media.MediaRecorder();
        }

        const audioSource = options.source ? options.source : 0;
        TNS_Recorder_Log('setting audio source', audioSource);
        this._recorder.setAudioSource(audioSource);

        const outFormat = options.format ? options.format : 0;
        TNS_Recorder_Log('setting output format', outFormat);
        this._recorder.setOutputFormat(outFormat);

        const encoder = options.encoder ? options.encoder : 0;
        TNS_Recorder_Log('setting audio encoder', encoder);
        this._recorder.setAudioEncoder(encoder);

        if (options.channels) {
          this._recorder.setAudioChannels(options.channels);
        }
        if (options.sampleRate) {
          this._recorder.setAudioSamplingRate(options.sampleRate);
        }
        if (options.bitRate) {
          this._recorder.setAudioEncodingBitRate(options.bitRate);
        }

        this._recorder.setOutputFile(options.filename);

        // On Error
        this._recorder.setOnErrorListener(
          new android.media.MediaRecorder.OnErrorListener({
            onError: (recorder: any, error: number, extra: number) => {
              options.errorCallback({ recorder, error, extra });
            }
          })
        );

        // On Info
        this._recorder.setOnInfoListener(
          new android.media.MediaRecorder.OnInfoListener({
            onInfo: (recorder: any, info: number, extra: number) => {
              options.infoCallback({ recorder, info, extra });
            }
          })
        );

        this._recorder.prepare();
        this._recorder.start();

        resolve();
      } catch (ex) {
        reject(ex);
      }
    });
  }

  public getMeters(): number {
    if (this._recorder != null) return this._recorder.getMaxAmplitude();
    else return 0;
  }

  public pause(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._recorder) {
          TNS_Recorder_Log('pausing recorder...');
          this._recorder.pause();
        }
        resolve();
      } catch (ex) {
        TNS_Recorder_Log('pause error', ex);
        reject(ex);
      }
    });
  }

  public resume(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._recorder) {
          TNS_Recorder_Log('resuming recorder...');
          this._recorder.resume();
        }
        resolve();
      } catch (ex) {
        TNS_Recorder_Log('resume error', ex);
        reject(ex);
      }
    });
  }

  public stop(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._recorder) {
          TNS_Recorder_Log('stopping recorder...');
          this._recorder.stop();
        }
        resolve();
      } catch (ex) {
        TNS_Recorder_Log('stop error', ex);
        reject(ex);
      }
    });
  }

  public dispose(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        TNS_Recorder_Log('disposing recorder...');
        if (this._recorder) {
          this._recorder.release();
        }
        this._recorder = undefined;
        resolve();
      } catch (ex) {
        TNS_Recorder_Log('dispose error', ex);
        reject(ex);
      }
    });
  }
}
