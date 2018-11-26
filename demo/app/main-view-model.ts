import { AudioPlayerOptions, AudioRecorderOptions, TNSPlayer, TNSRecorder } from 'nativescript-audio';
import * as app from 'tns-core-modules/application';
import { Observable } from 'tns-core-modules/data/observable';
import { File, knownFolders } from 'tns-core-modules/file-system';
import { isAndroid } from 'tns-core-modules/platform';
import * as timer from 'tns-core-modules/timer';
import * as dialogs from 'tns-core-modules/ui/dialogs';
import { Page } from 'tns-core-modules/ui/page';
import { Slider } from 'tns-core-modules/ui/slider';
import './async-await';
import { Prop } from './prop';

export class AudioDemo extends Observable {
  @Prop() public isPlaying: boolean;
  @Prop() public isRecording: boolean;
  @Prop() public audioMeter = '0';
  @Prop() public recordedAudioFile: string;
  @Prop() public currentVolume;
  @Prop() public audioTrackDuration;
  @Prop() public remainingDuration; // used to show the remaining time of the audio track
  private _recorder;
  private _player: TNSPlayer;
  private _audioSessionId;
  private _page;
  private _lastRecordedAudioFile: string;
  private _audioUrls: Array<any> = [
    {
      name: 'Fight Club',
      pic: '~/pics/canoe_girl.jpeg',
      url: 'http://www.noiseaddicts.com/samples_1w72b820/2514.mp3'
    },
    {
      name: 'To The Bat Cave!!!',
      pic: '~/pics/bears.jpeg',
      url: 'http://www.noiseaddicts.com/samples_1w72b820/17.mp3'
    },
    {
      name: 'Marlon Brando',
      pic: '~/pics/northern_lights.jpeg',
      url: 'http://www.noiseaddicts.com/samples_1w72b820/47.mp3'
    }
  ];
  private _meterInterval: any;
  private _slider: Slider;

  constructor(page: Page) {
    super();
    this._player = new TNSPlayer();
    this._player.debug = true; // set true for tns_player logs

    this._recorder = new TNSRecorder();
    this._recorder.debug = true; // set true for tns_recorder logs

    this.currentVolume = 1;
    this._slider = page.getViewById('volumeSlider') as Slider;

    // Set player volume
    if (this._slider) {
      this._slider.on('valueChange', (data: any) => {
        this._player.volume = this._slider.value / 100;
      });
    }
  }

  public async startRecord() {
    try {
      if (!TNSRecorder.CAN_RECORD()) {
        dialogs.alert('This device cannot record audio.');
        return;
      }
      const audioFolder = knownFolders.currentApp().getFolder('audio');
      console.log(JSON.stringify(audioFolder));

      let androidFormat;
      let androidEncoder;
      if (isAndroid) {
        // m4a
        // static constants, using raw values here
        // androidFormat = android.media.MediaRecorder.OutputFormat.MPEG_4;
        androidFormat = 2;
        // androidEncoder = android.media.MediaRecorder.AudioEncoder.AAC;
        androidEncoder = 3;
      }

      const dateTime = this._createDateTimeStamp();

      this._lastRecordedAudioFile = `${
        audioFolder.path
      }/recording_${dateTime}.${this.platformExtension()}`;
      console.log('recorded audio file path', this._lastRecordedAudioFile);

      const recorderOptions: AudioRecorderOptions = {
        filename: this._lastRecordedAudioFile,

        format: androidFormat,

        encoder: androidEncoder,

        metering: true,

        infoCallback: infoObject => {
          console.log(JSON.stringify(infoObject));
        },

        errorCallback: errorObject => {
          console.log(JSON.stringify(errorObject));
        }
      };

      await this._recorder.start(recorderOptions);
      this.isRecording = true;
      if (recorderOptions.metering) {
        this._initMeter();
      }
    } catch (err) {
      this.isRecording = false;
      this._resetMeter();
      dialogs.alert(err);
    }
  }

  public async stopRecord() {
    this._resetMeter();
    await this._recorder.stop().catch(ex => {
      console.log(ex);
      this.isRecording = false;
      this._resetMeter();
    });

    this.isRecording = false;
    alert('Recorder stopped.');
    this._resetMeter();
  }

  private _initMeter() {
    this._resetMeter();
    this._meterInterval = setInterval(() => {
      this.audioMeter = this._recorder.getMeters();
      console.log(this.audioMeter);
    }, 300);
  }

  private _resetMeter() {
    if (this._meterInterval) {
      this.audioMeter = '0';
      clearInterval(this._meterInterval);
      this._meterInterval = undefined;
    }
  }

  public getFile() {
    try {
      const audioFolder = knownFolders.currentApp().getFolder('audio');
      // get the last recorded audio file
      const recordedFile = audioFolder.getFile(this._lastRecordedAudioFile);

      console.log(JSON.stringify(recordedFile));
      console.log('recording exists: ' + File.exists(recordedFile.path));
      this.recordedAudioFile = recordedFile.path;
    } catch (ex) {
      console.log(ex);
    }
  }

  public async playRecordedFile() {
    const audioFolder = knownFolders.currentApp().getFolder('audio');
    console.log('audioFolder', audioFolder);
    // get the last recorded audio file
    const recordedFile = audioFolder.getFile(this._lastRecordedAudioFile);

    console.log('RECORDED FILE : ' + JSON.stringify(recordedFile));

    const playerOptions: AudioPlayerOptions = {
      // audioFile: `~/audio/recording.${this.platformExtension()}`,
      audioFile: recordedFile.path,
      loop: false,
      completeCallback: async () => {
        alert('Audio file complete.');
        this.isPlaying = false;
        if (!playerOptions.loop) {
          await this._player.dispose();
          console.log('player disposed');
        }
      },

      errorCallback: errorObject => {
        console.log(JSON.stringify(errorObject));
        this.isPlaying = false;
      },

      infoCallback: infoObject => {
        console.log(JSON.stringify(infoObject));
        dialogs.alert('Info callback');
      }
    };

    await this._player.playFromFile(playerOptions).catch(err => {
      console.log('error playFromFile');
      this.isPlaying = false;
    });

    this.isPlaying = true;
  }

  /***** AUDIO PLAYER *****/

  public async playAudio(filepath: string, fileType: string) {
    try {
      const playerOptions: AudioPlayerOptions = {
        audioFile: filepath,
        loop: false,
        completeCallback: async () => {
          alert('Audio file complete.');
          await this._player.dispose();
          this.isPlaying = false;
          console.log('player disposed');
        },
        errorCallback: errorObject => {
          console.log(JSON.stringify(errorObject));
          this.isPlaying = false;
        },
        infoCallback: args => {
          dialogs.alert('Info callback: ' + args.info);
          console.log(JSON.stringify(args));
        }
      };

      this.isPlaying = true;

      if (fileType === 'localFile') {
        await this._player.playFromFile(playerOptions).catch(error => {
          console.log(error);
          this.isPlaying = false;
        });

        this.isPlaying = true;
        this.audioTrackDuration = await this._player.getAudioTrackDuration();
        // start audio duration tracking
        this._startDurationTracking(this.audioTrackDuration);
        this._startVolumeTracking();
      } else if (fileType === 'remoteFile') {
        await this._player.playFromUrl(playerOptions).catch(error => {
          console.log(error);
          this.isPlaying = false;
        });
        this.isPlaying = true;
      }
    } catch (ex) {
      console.log(ex);
    }
  }

  /**
   * PLAY REMOTE AUDIO FILE
   */
  public playRemoteFile() {
    console.log('playRemoteFile');
    const filepath = 'http://www.noiseaddicts.com/samples_1w72b820/2514.mp3';

    this.playAudio(filepath, 'remoteFile');
  }

  public resumePlayer() {
    console.log(JSON.stringify(this._player));
    this._player.resume();
  }

  /**
   * PLAY LOCAL AUDIO FILE from app folder
   */
  public playLocalFile() {
    const filepath = '~/audio/angel.mp3';
    this.playAudio(filepath, 'localFile');
  }

  /**
   * PAUSE PLAYING
   */
  public async pauseAudio() {
    try {
      await this._player.pause();
      this.isPlaying = false;
    } catch (error) {
      console.log(error);
      this.isPlaying = true;
    }
  }

  public async stopPlaying() {
    await this._player.dispose();
    alert('Media Player Disposed.');
  }

  /**
   * RESUME PLAYING
   */
  public resumePlaying() {
    console.log('START');
    this._player.play();
  }

  public muteTap() {
    this._player.volume = 0;
  }

  public unmuteTap() {
    this._player.volume = 1;
  }

  public skipTo8() {
    this._player.seekTo(8);
  }

  public playSpeed1() {
    this._player.changePlayerSpeed(1);
  }

  public playSpeed15() {
    this._player.changePlayerSpeed(1.5);
  }

  public playSpeed2() {
    this._player.changePlayerSpeed(2);
  }

  private platformExtension() {
    // 'mp3'
    return `${app.android ? 'm4a' : 'caf'}`;
  }

  private async _startDurationTracking(duration) {
    if (this._player && this._player.isAudioPlaying()) {
      const timerId = timer.setInterval(() => {
        this.remainingDuration = duration - this._player.currentTime;
        // console.log(`this.remainingDuration = ${this.remainingDuration}`);
      }, 1000);
    }
  }

  private _startVolumeTracking() {
    if (this._player) {
      const timerId = timer.setInterval(() => {
        console.log('volume tracking', this._player.volume);
        this.currentVolume = this._player.volume;
      }, 2000);
    }
  }

  /**
   * Create date time stamp similar to Java Date()
   */
  private _createDateTimeStamp() {
    let result = '';
    const date = new Date();
    result =
      date.getFullYear().toString() +
      (date.getMonth() + 1 < 10
        ? '0' + (date.getMonth() + 1).toString()
        : (date.getMonth() + 1).toString()) +
      (date.getDate() < 10
        ? '0' + date.getDate().toString()
        : date.getDate().toString()) +
      '_' +
      date.getHours().toString() +
      date.getMinutes().toString() +
      date.getSeconds().toString();
    return result;
  }
}
