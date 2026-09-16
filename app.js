/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.2
 * iPhone Stable Scan / Consensus Engine
 *
 * External Camera Engine
 * ==========================================================
 */


/**
 * ==========================================================
 * CONFIGURATION
 *
 * IMPORTANT:
 * Replace this value with your real Apps Script /exec URL.
 * ==========================================================
 */

const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbzDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';


const APP_VERSION =
  'V1.1.2';


const CONSENSUS_CAPTURE_COUNT =
  3;


const CONSENSUS_REQUIRED =
  2;


const CAPTURE_INTERVAL_MS =
  320;


const FIRST_CAPTURE_DELAY_MS =
  450;



/**
 * ==========================================================
 * GLOBAL STATE
 * ==========================================================
 */

let cameraStream =
  null;


let videoDevices =
  [];


let currentDeviceId =
  null;


let currentCameraIndex =
  0;


let ocrWorker =
  null;


let ocrBusy =
  false;


/**
 * Verification state
 *
 * mode:
 * none
 * manual
 * consensus
 * photo
 */
let macVerification = {

  mode:
    'none',

  confirmed:
    false,

  confidence:
    '',

  votes:
    '',

  mac:
    ''

};



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {


    updateVersionUI();


    handleMacInput();


    loadDashboard();


    await discoverCameras();


  }

);



/**
 * ==========================================================
 * VERSION UI
 *
 * index.html does not need modification.
 * ==========================================================
 */

function updateVersionUI() {


  const versionBox =
    document.querySelector(
      '.version'
    );


  if (
    versionBox
  ) {

    versionBox.textContent =
      APP_VERSION;

  }


  const footer =
    document.querySelector(
      'footer'
    );


  if (
    footer
  ) {

    footer.textContent =

      'ICHC MAC Scanner • Consensus Engine • ' +

      APP_VERSION;

  }

}



/**
 * ==========================================================
 * SMALL DELAY
 * ==========================================================
 */

function sleep(
  ms
) {

  return new Promise(

    function (
      resolve
    ) {

      setTimeout(
        resolve,
        ms
      );

    }

  );

}



/**
 * ==========================================================
 * CAMERA DISCOVERY
 * ==========================================================
 */

async function discoverCameras() {


  if (

    !navigator.mediaDevices ||

    !navigator.mediaDevices.enumerateDevices

  ) {


    showMessage(

      'This browser does not support camera access.',

      'error'

    );


    return;

  }


  try {


    const devices =

      await navigator
        .mediaDevices
        .enumerateDevices();



    videoDevices =

      devices.filter(

        function (
          device
        ) {

          return (
            device.kind ===
            'videoinput'
          );

        }

      );


    populateCameraList();


  } catch (
    error
  ) {


    console.error(

      'Camera discovery error:',

      error

    );


  }

}



/**
 * ==========================================================
 * CAMERA LIST
 * ==========================================================
 */

function populateCameraList() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  const row =

    document.getElementById(
      'cameraSelectRow'
    );


  if (
    !select ||
    !row
  ) {

    return;

  }


  select.innerHTML =
    '';


  if (

    videoDevices.length ===
    0

  ) {


    row.classList.add(
      'hidden'
    );


    return;

  }


  videoDevices.forEach(

    function (
      device,
      index
    ) {


      const option =

        document.createElement(
          'option'
        );


      option.value =
        device.deviceId;


      option.textContent =

        device.label ||

        (
          'Camera ' +
          (index + 1)
        );


      select.appendChild(
        option
      );


    }

  );


  row.classList.remove(
    'hidden'
  );

}



/**
 * ==========================================================
 * START CAMERA
 * ==========================================================
 */

async function startCamera(
  requestedDeviceId = null
) {


  const video =

    document.getElementById(
      'camera'
    );


  try {


    stopCamera();


    let constraints;



    if (
      requestedDeviceId
    ) {


      constraints = {

        video: {

          deviceId: {

            exact:
              requestedDeviceId

          },


          width: {

            ideal:
              1920

          },


          height: {

            ideal:
              1080

          }

        },


        audio:
          false

      };


    } else {


      constraints = {

        video: {

          facingMode: {

            ideal:
              'environment'

          },


          width: {

            ideal:
              1920

          },


          height: {

            ideal:
              1080

          }

        },


        audio:
          false

      };

    }



    cameraStream =

      await navigator
        .mediaDevices
        .getUserMedia(
          constraints
        );



    video.srcObject =
      cameraStream;



    await video.play();



    document

      .getElementById(
        'cameraPlaceholder'
      )

      .classList

      .add(
        'hidden'
      );



    document

      .getElementById(
        'scanBtn'
      )

      .disabled =
      false;



    document

      .getElementById(
        'switchCameraBtn'
      )

      .disabled =
      false;



    document

      .getElementById(
        'startCameraBtn'
      )

      .textContent =
      'RESTART CAMERA';



    await discoverCameras();



    const activeTrack =

      cameraStream
        .getVideoTracks()[0];



    const settings =

      activeTrack
        .getSettings();



    currentDeviceId =

      settings.deviceId ||
      null;



    syncCameraSelector();



    setSystemStatus(

      'Camera ready',

      true

    );


  } catch (
    error
  ) {


    console.error(

      'Camera error:',

      error

    );


    handleCameraError(
      error
    );


  }

}



/**
 * ==========================================================
 * STOP CAMERA
 * ==========================================================
 */

function stopCamera() {


  if (
    !cameraStream
  ) {

    return;

  }


  cameraStream

    .getTracks()

    .forEach(

      function (
        track
      ) {

        track.stop();

      }

    );


  cameraStream =
    null;

}



/**
 * ==========================================================
 * CAMERA ERROR
 * ==========================================================
 */

function handleCameraError(
  error
) {


  let message =

    'Camera could not be started.';



  switch (
    error.name
  ) {


    case 'NotAllowedError':

      message =

        'Camera permission was denied. Allow camera access in your browser settings.';

      break;



    case 'NotFoundError':

      message =

        'No camera was detected on this device.';

      break;



    case 'NotReadableError':

      message =

        'The camera may already be used by another application.';

      break;



    case 'OverconstrainedError':

      message =

        'The selected camera is not available.';

      break;



    case 'SecurityError':

      message =

        'Camera access requires HTTPS.';

      break;

  }



  setSystemStatus(

    'Camera unavailable',

    false

  );



  showMessage(

    message,

    'error'

  );

}



/**
 * ==========================================================
 * CHANGE CAMERA
 * ==========================================================
 */

async function changeCamera() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  if (
    !select ||
    !select.value
  ) {

    return;

  }


  currentDeviceId =
    select.value;


  await startCamera(
    currentDeviceId
  );

}



/**
 * ==========================================================
 * SYNC CAMERA SELECTOR
 * ==========================================================
 */

function syncCameraSelector() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  if (

    select &&

    currentDeviceId

  ) {


    select.value =
      currentDeviceId;


  }

}



/**
 * ==========================================================
 * SWITCH CAMERA
 * ==========================================================
 */

async function switchCamera() {


  if (

    videoDevices.length <
    2

  ) {


    showMessage(

      'Only one camera is available.',

      'warning'

    );


    return;

  }



  const currentIndex =

    videoDevices.findIndex(

      function (
        device
      ) {

        return (

          device.deviceId ===
          currentDeviceId

        );

      }

    );



  currentCameraIndex =

    currentIndex >= 0

      ? currentIndex + 1

      : 0;



  if (

    currentCameraIndex >=
    videoDevices.length

  ) {


    currentCameraIndex =
      0;

  }



  const nextDevice =

    videoDevices[
      currentCameraIndex
    ];



  await startCamera(

    nextDevice.deviceId

  );

}



/**
 * ==========================================================
 * RESET OCR VERIFICATION
 * ==========================================================
 */

function resetVerification() {


  macVerification = {

    mode:
      'none',

    confirmed:
      false,

    confidence:
      '',

    votes:
      '',

    mac:
      ''

  };

}



/**
 * ==========================================================
 * MAIN SCAN
 *
 * V1.1.2:
 * capture 3 independent frames.
 * ==========================================================
 */

async function scanMac() {


  if (
    ocrBusy
  ) {

    return;

  }



  const video =

    document.getElementById(
      'camera'
    );



  if (

    !video ||

    !video.videoWidth ||

    !video.videoHeight

  ) {


    showMessage(

      'Camera is not ready.',

      'warning'

    );


    return;

  }



  resetVerification();



  ocrBusy =
    true;



  const scanBtn =

    document.getElementById(
      'scanBtn'
    );



  scanBtn.disabled =
    true;



  try {


    setOCRStatus(

      true,

      'Stabilizing camera...',

      'Hold the device steady'

    );



    await sleep(
      FIRST_CAPTURE_DELAY_MS
    );



    const frames =
      [];



    for (

      let i = 0;

      i <
      CONSENSUS_CAPTURE_COUNT;

      i++

    ) {


      setOCRStatus(

        true,

        'Capturing...',

        'Frame ' +
        (i + 1) +
        ' of ' +
        CONSENSUS_CAPTURE_COUNT

      );



      const frame =

        captureVideoFrame(
          video
        );



      frames.push(
        frame
      );



      if (

        i <
        CONSENSUS_CAPTURE_COUNT - 1

      ) {


        await sleep(
          CAPTURE_INTERVAL_MS
        );


      }


    }



    await processConsensusFrames(
      frames
    );


  } catch (
    error
  ) {


    console.error(

      'Consensus scan error:',

      error

    );



    setOCRStatus(
      false
    );



    showMessage(

      'Scan error: ' +
      error.message,

      'error'

    );


  } finally {


    ocrBusy =
      false;



    if (
      cameraStream
    ) {


      scanBtn.disabled =
        false;


    }


  }

}



/**
 * ==========================================================
 * CAPTURE FRAME
 * ==========================================================
 */

function captureVideoFrame(
  video
) {


  const canvas =

    document.createElement(
      'canvas'
    );



  const ctx =

    canvas.getContext(

      '2d',

      {

        willReadFrequently:
          true

      }

    );



  const sourceWidth =
    video.videoWidth;


  const sourceHeight =
    video.videoHeight;



  /*
   * Focus on the green scanning area.
   *
   * Narrower than V1.1.1 to reduce unrelated
   * numbers such as IP, serial, DNS, etc.
   */

  const cropWidth =

    Math.floor(

      sourceWidth *
      0.90

    );



  const cropHeight =

    Math.floor(

      sourceHeight *
      0.52

    );



  const startX =

    Math.floor(

      (
        sourceWidth -
        cropWidth
      ) / 2

    );



  const startY =

    Math.floor(

      (
        sourceHeight -
        cropHeight
      ) / 2

    );



  canvas.width =
    cropWidth;


  canvas.height =
    cropHeight;



  ctx.drawImage(

    video,

    startX,

    startY,

    cropWidth,

    cropHeight,

    0,

    0,

    cropWidth,

    cropHeight

  );



  return canvas;

}



/**
 * ==========================================================
 * CONSENSUS PROCESSING
 * ==========================================================
 */

async function processConsensusFrames(
  frames
) {


  const worker =
    await getOCRWorker();



  const results =
    [];



  for (

    let i = 0;

    i < frames.length;

    i++

  ) {


    setOCRStatus(

      true,

      'Reading MAC Address...',

      'Scan ' +
      (i + 1) +
      ' of ' +
      frames.length

    );



    const frameResult =

      await recognizeFrameMAC(

        worker,

        frames[i],

        i + 1

      );



    results.push(
      frameResult
    );



    console.log(

      'MAC consensus frame ' +
      (i + 1),

      frameResult

    );


  }



  evaluateConsensus(
    results
  );

}



/**
 * ==========================================================
 * OCR ONE FRAME
 *
 * Pass 1 = original
 * Pass 2 = contrast only if necessary
 *
 * This keeps iPhone scan time reasonable.
 * ==========================================================
 */

async function recognizeFrameMAC(

  worker,

  originalCanvas,

  frameNumber

) {


  const originalResult =

    await worker.recognize(
      originalCanvas
    );



  const originalText =

    originalResult &&
    originalResult.data

      ? originalResult.data.text || ''

      : '';



  console.log(

    'Frame ' +
    frameNumber +
    ' ORIGINAL OCR:',

    originalText

  );



  let candidate =

    extractBestMacCandidate(
      originalText
    );



  if (
    candidate
  ) {


    return {

      mac:
        candidate.mac,

      score:
        candidate.score,

      labeled:
        candidate.labeled,

      corrected:
        candidate.corrected,

      source:
        'original'

    };


  }



  /*
   * Only use contrast OCR when the original
   * did not produce a trustworthy candidate.
   */

  const contrastCanvas =

    createContrastCanvas(
      originalCanvas
    );



  const contrastResult =

    await worker.recognize(
      contrastCanvas
    );



  const contrastText =

    contrastResult &&
    contrastResult.data

      ? contrastResult.data.text || ''

      : '';



  console.log(

    'Frame ' +
    frameNumber +
    ' CONTRAST OCR:',

    contrastText

  );



  candidate =

    extractBestMacCandidate(
      contrastText
    );



  if (
    candidate
  ) {


    return {

      mac:
        candidate.mac,

      score:
        candidate.score,

      labeled:
        candidate.labeled,

      corrected:
        candidate.corrected,

      source:
        'contrast'

    };


  }



  return {

    mac:
      null,

    score:
      0,

    labeled:
      false,

    corrected:
      false,

    source:
      'none'

  };

}



/**
 * ==========================================================
 * CONSENSUS DECISION
 * ==========================================================
 */

function evaluateConsensus(
  results
) {


  const validResults =

    results.filter(

      function (
        result
      ) {

        return (
          result &&
          result.mac
        );

      }

    );



  if (
    validResults.length ===
    0
  ) {


    rejectUnstableReading(

      'No MAC Address could be read reliably.'

    );


    return;

  }



  const counts =
    {};



  validResults.forEach(

    function (
      result
    ) {


      if (
        !counts[result.mac]
      ) {


        counts[result.mac] = {

          count:
            0,

          totalScore:
            0,

          labeledCount:
            0

        };


      }



      counts[result.mac].count++;


      counts[result.mac].totalScore +=
        result.score || 0;



      if (
        result.labeled
      ) {


        counts[result.mac].labeledCount++;


      }


    }

  );



  let winnerMac =
    null;


  let winnerCount =
    0;


  let winnerScore =
    0;



  Object.keys(
    counts
  ).forEach(

    function (
      mac
    ) {


      const item =
        counts[mac];



      if (

        item.count >
        winnerCount

      ) {


        winnerMac =
          mac;


        winnerCount =
          item.count;


        winnerScore =
          item.totalScore;


      } else if (

        item.count ===
        winnerCount &&

        item.totalScore >
        winnerScore

      ) {


        winnerMac =
          mac;


        winnerScore =
          item.totalScore;


      }


    }

  );



  /*
   * Core V1.1.2 rule:
   *
   * Same MAC must appear in at least
   * 2 of the 3 independent captures.
   */

  if (

    winnerMac &&

    winnerCount >=
    CONSENSUS_REQUIRED

  ) {


    const confidence =

      winnerCount ===
      CONSENSUS_CAPTURE_COUNT

        ? 'HIGH'

        : 'GOOD';



    acceptConsensusMac(

      winnerMac,

      winnerCount,

      CONSENSUS_CAPTURE_COUNT,

      confidence

    );


    return;

  }



  /*
   * No exact consensus.
   * Reject rather than guess.
   */

  const readable =

    validResults
      .map(
        function (
          result
        ) {

          return result.mac;

        }
      )
      .join(
        ' / '
      );



  console.warn(

    'Consensus rejected:',

    readable

  );



  rejectUnstableReading(

    'Different results were detected between scans.'

  );

}



/**
 * ==========================================================
 * ACCEPT CONSENSUS
 * ==========================================================
 */

function acceptConsensusMac(

  mac,

  votes,

  total,

  confidence

) {


  const input =

    document.getElementById(
      'macInput'
    );



  input.value =
    mac;



  macVerification = {

    mode:
      'consensus',

    confirmed:
      true,

    confidence:
      confidence,

    votes:
      votes +
      ' / ' +
      total,

    mac:
      mac

  };



  updateVerifiedMacUI();



  setOCRStatus(
    false
  );



  vibrateSuccess();



  showMessage(

    'Confirmed MAC: ' +
    mac +
    ' • ' +
    votes +
    '/' +
    total +
    ' scans',

    'success'

  );

}



/**
 * ==========================================================
 * REJECT UNSTABLE READING
 * ==========================================================
 */

function rejectUnstableReading(
  reason
) {


  resetVerification();



  const input =

    document.getElementById(
      'macInput'
    );



  input.value =
    '';



  const saveBtn =

    document.getElementById(
      'saveBtn'
    );



  saveBtn.disabled =
    true;



  setOCRStatus(
    false
  );



  setMacState(

    'invalid',

    'Unstable reading'

  );



  const validation =

    document.getElementById(
      'macValidation'
    );



  validation.textContent =

    'Not saved — scan again and hold the phone steady.';



  validation.style.color =
    '#d63b3b';



  showMessage(

    reason +
    ' Hold the phone steady, keep the MAC inside the scan area and scan again.',

    'warning'

  );

}



/**
 * ==========================================================
 * PHOTO / IMAGE
 *
 * Photos cannot provide independent temporal frames,
 * so we use multiple image-processing variants.
 * User must still verify the result.
 * ==========================================================
 */

function scanUploadedPhoto(
  event
) {


  const file =

    event
      .target
      .files[0];


  if (
    !file
  ) {

    return;

  }



  const reader =
    new FileReader();



  reader.onload =

    function (
      e
    ) {


      const img =
        new Image();



      img.onload =

        async function () {


          const canvas =

            document.createElement(
              'canvas'
            );



          const ctx =

            canvas.getContext(

              '2d',

              {

                willReadFrequently:
                  true

              }

            );



          const maxWidth =
            2200;



          let width =
            img.width;


          let height =
            img.height;



          if (

            width >
            maxWidth

          ) {


            const ratio =

              maxWidth /
              width;



            width =
              maxWidth;



            height =

              Math.round(

                height *
                ratio

              );


          }



          canvas.width =
            width;


          canvas.height =
            height;



          ctx.drawImage(

            img,

            0,

            0,

            width,

            height

          );



          await processUploadedPhoto(
            canvas
          );


        };



      img.src =
        e.target.result;


    };



  reader.readAsDataURL(
    file
  );

}



/**
 * ==========================================================
 * PROCESS UPLOADED PHOTO
 * ==========================================================
 */

async function processUploadedPhoto(
  canvas
) {


  if (
    ocrBusy
  ) {

    return;

  }



  ocrBusy =
    true;



  resetVerification();



  setOCRStatus(

    true,

    'Reading photo...',

    'Searching for MAC Address'

  );



  try {


    const worker =
      await getOCRWorker();



    const variants = [

      canvas,

      createContrastCanvas(
        canvas
      ),

      createThresholdCanvas(
        canvas
      )

    ];



    const candidates =
      [];



    for (

      let i = 0;

      i < variants.length;

      i++

    ) {


      setOCRStatus(

        true,

        'Reading photo...',

        'Analysis ' +
        (i + 1) +
        ' of ' +
        variants.length

      );



      const result =

        await worker.recognize(
          variants[i]
        );



      const text =

        result &&
        result.data

          ? result.data.text || ''

          : '';



      console.log(

        'Photo OCR pass ' +
        (i + 1),

        text

      );



      const candidate =

        extractBestMacCandidate(
          text
        );



      if (
        candidate
      ) {


        candidates.push(
          candidate
        );


      }


    }



    if (
      candidates.length ===
      0
    ) {


      rejectUnstableReading(

        'No MAC Address was detected in the photo.'

      );


      return;

    }



    const counts =
      {};



    candidates.forEach(

      function (
        candidate
      ) {


        counts[candidate.mac] =

          (
            counts[candidate.mac] ||
            0
          ) + 1;


      }

    );



    let winnerMac =
      null;


    let winnerCount =
      0;



    Object.keys(
      counts
    ).forEach(

      function (
        mac
      ) {


        if (

          counts[mac] >
          winnerCount

        ) {


          winnerMac =
            mac;


          winnerCount =
            counts[mac];


        }


      }

    );



    if (

      winnerMac &&

      winnerCount >=
      2

    ) {


      const input =

        document.getElementById(
          'macInput'
        );



      input.value =
        winnerMac;



      macVerification = {

        mode:
          'photo',

        confirmed:
          true,

        confidence:
          'GOOD',

        votes:
          winnerCount +
          ' / 3 analyses',

        mac:
          winnerMac

      };



      updateVerifiedMacUI();



      setOCRStatus(
        false
      );



      showMessage(

        'MAC detected from photo: ' +
        winnerMac,

        'success'

      );


    } else {


      rejectUnstableReading(

        'The photo produced inconsistent OCR results.'

      );


    }


  } catch (
    error
  ) {


    console.error(
      error
    );



    setOCRStatus(
      false
    );



    showMessage(

      'OCR error: ' +
      error.message,

      'error'

    );


  } finally {


    ocrBusy =
      false;


  }

}



/**
 * ==========================================================
 * CLONE CANVAS
 * ==========================================================
 */

function cloneCanvas(
  source
) {


  const canvas =

    document.createElement(
      'canvas'
    );



  canvas.width =
    source.width;


  canvas.height =
    source.height;



  const ctx =

    canvas.getContext(

      '2d',

      {

        willReadFrequently:
          true

      }

    );



  ctx.drawImage(

    source,

    0,

    0

  );



  return canvas;

}



/**
 * ==========================================================
 * HIGH CONTRAST IMAGE
 * ==========================================================
 */

function createContrastCanvas(
  source
) {


  const canvas =

    cloneCanvas(
      source
    );



  const ctx =

    canvas.getContext(

      '2d',

      {

        willReadFrequently:
          true

      }

    );



  const imageData =

    ctx.getImageData(

      0,

      0,

      canvas.width,

      canvas.height

    );



  const data =
    imageData.data;



  const contrast =
    1.55;



  for (

    let i = 0;

    i < data.length;

    i += 4

  ) {


    const gray =

      data[i] *
      0.299

      +

      data[i + 1] *
      0.587

      +

      data[i + 2] *
      0.114;



    let value =

      (
        gray -
        128
      )

      *

      contrast

      +

      128;



    value =

      Math.max(

        0,

        Math.min(

          255,

          value

        )

      );



    data[i] =
      value;


    data[i + 1] =
      value;


    data[i + 2] =
      value;


  }



  ctx.putImageData(

    imageData,

    0,

    0

  );



  return canvas;

}



/**
 * ==========================================================
 * BLACK / WHITE IMAGE
 * ==========================================================
 */

function createThresholdCanvas(
  source
) {


  const canvas =

    cloneCanvas(
      source
    );



  const ctx =

    canvas.getContext(

      '2d',

      {

        willReadFrequently:
          true

      }

    );



  const imageData =

    ctx.getImageData(

      0,

      0,

      canvas.width,

      canvas.height

    );



  const data =
    imageData.data;



  const threshold =
    155;



  for (

    let i = 0;

    i < data.length;

    i += 4

  ) {


    const gray =

      data[i] *
      0.299

      +

      data[i + 1] *
      0.587

      +

      data[i + 2] *
      0.114;



    const value =

      gray >= threshold

        ? 255

        : 0;



    data[i] =
      value;


    data[i + 1] =
      value;


    data[i + 2] =
      value;


  }



  ctx.putImageData(

    imageData,

    0,

    0

  );



  return canvas;

}



/**
 * ==========================================================
 * OCR WORKER
 * ==========================================================
 */

async function getOCRWorker() {


  if (
    ocrWorker
  ) {


    return ocrWorker;


  }



  setOCRStatus(

    true,

    'Loading OCR engine...',

    'First scan may take a few seconds.'

  );



  ocrWorker =

    await Tesseract
      .createWorker(

        'eng',

        1,

        {

          logger:

            function (
              message
            ) {


              if (

                message.status &&

                message.progress !==
                  undefined

              ) {


                const percentage =

                  Math.round(

                    message.progress *
                    100

                  );



                setOCRStatus(

                  true,

                  'Reading label...',

                  message.status +
                  ' ' +
                  percentage +
                  '%'

                );


              }


            }


        }

      );



  await ocrWorker.setParameters({


    tessedit_char_whitelist:

      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-.() ',


    preserve_interword_spaces:

      '1'


  });



  return ocrWorker;

}



/**
 * ==========================================================
 * MAC KEYWORDS
 * ==========================================================
 */

function isMacLabelLine(
  line
) {


  const value =

    String(
      line
    )
      .toUpperCase();



  const labels = [


    'PHYSICAL ADDRESS',


    'PHYSICAL ADDRESS (MAC)',


    'MAC ADDRESS',


    'MACADDRESS',


    'MAC:',


    'MAC ',


    'WLAN MAC',


    'WIRELESS MAC',


    'WI-FI ADDRESS',


    'WIFI ADDRESS',


    'ETHERNET MAC',


    'LAN MAC',


    'NETWORK ADDRESS'


  ];



  return labels.some(

    function (
      label
    ) {


      return value.includes(
        label
      );


    }

  );

}



/**
 * ==========================================================
 * EXTRACT BEST CANDIDATE
 *
 * V1.1.2 deliberately avoids arbitrary
 * 12-character sliding windows.
 * ==========================================================
 */

function extractBestMacCandidate(
  text
) {


  if (
    !text
  ) {


    return null;


  }



  const upper =

    String(text)

      .toUpperCase()

      .replace(
        /\r/g,
        '\n'
      );



  const candidates =
    [];



  const lines =

    upper.split(
      '\n'
    );



  /**
   * ========================================================
   * PASS 1
   * Lines explicitly describing MAC address.
   * ========================================================
   */

  for (

    let i = 0;

    i < lines.length;

    i++

  ) {


    const line =
      lines[i];



    if (
      !isMacLabelLine(
        line
      )
    ) {


      continue;


    }



    const found =

      extractStrictCandidatesFromLine(

        line,

        true

      );



    candidates.push(
      ...found
    );



    /*
     * Sometimes label and MAC are on adjacent lines.
     */

    if (

      i + 1 <
      lines.length

    ) {


      const nextLineFound =

        extractStrictCandidatesFromLine(

          lines[i + 1],

          true

        );



      candidates.push(
        ...nextLineFound
      );


    }


  }



  /**
   * ========================================================
   * PASS 2
   * Strict, separator-based MAC anywhere in OCR.
   *
   * No OCR corrections here.
   * ========================================================
   */

  const standardPatterns = [


    /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,


    /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,


    /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g


  ];



  standardPatterns.forEach(

    function (
      pattern
    ) {


      const matches =

        upper.match(
          pattern
        );



      if (
        matches
      ) {


        matches.forEach(

          function (
            match
          ) {


            const mac =

              normalizeMac(
                match
              );



            if (
              mac
            ) {


              candidates.push({

                mac:
                  mac,

                score:
                  75,

                labeled:
                  false,

                corrected:
                  false

              });


            }


          }

        );


      }


    }

  );



  if (
    candidates.length ===
    0
  ) {


    return null;


  }



  /**
   * Deduplicate and keep highest score.
   */

  const bestByMac =
    {};



  candidates.forEach(

    function (
      candidate
    ) {


      if (

        !bestByMac[candidate.mac] ||

        candidate.score >
        bestByMac[candidate.mac].score

      ) {


        bestByMac[candidate.mac] =
          candidate;


      }


    }

  );



  const unique =

    Object.values(
      bestByMac
    );



  unique.sort(

    function (
      a,
      b
    ) {


      return (
        b.score -
        a.score
      );


    }

  );



  return unique[0] ||
    null;

}



/**
 * ==========================================================
 * STRICT CANDIDATES FROM LABELED LINE
 * ==========================================================
 */

function extractStrictCandidatesFromLine(

  line,

  labeled

) {


  const results =
    [];



  const original =

    String(line)
      .toUpperCase();



  /**
   * Exact separator forms.
   */

  const standardPatterns = [


    /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,


    /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,


    /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g


  ];



  standardPatterns.forEach(

    function (
      pattern
    ) {


      const matches =

        original.match(
          pattern
        );



      if (
        matches
      ) {


        matches.forEach(

          function (
            match
          ) {


            const mac =

              normalizeMac(
                match
              );



            if (
              mac
            ) {


              results.push({

                mac:
                  mac,

                score:
                  labeled
                    ? 120
                    : 80,

                labeled:
                  labeled,

                corrected:
                  false

              });


            }


          }

        );


      }


    }

  );



  /**
   * Compact 12-hex MAC is accepted ONLY
   * on a MAC-labeled line.
   */

  if (
    labeled
  ) {


    const compactMatches =

      original.match(
        /\b[0-9A-F]{12}\b/g
      );



    if (
      compactMatches
    ) {


      compactMatches.forEach(

        function (
          match
        ) {


          const mac =

            normalizeMac(
              match
            );



          if (
            mac
          ) {


            results.push({

              mac:
                mac,

              score:
                105,

              labeled:
                true,

              corrected:
                false

            });


          }


        }

      );


    }


  }



  /**
   * OCR correction is allowed ONLY
   * when the line is known to describe a MAC.
   */

  if (
    labeled
  ) {


    const corrected =

      applyMacOCRCorrections(
        original
      );



    const correctedPatterns = [


      /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,


      /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,


      /\b[0-9A-F]{12}\b/g


    ];



    correctedPatterns.forEach(

      function (
        pattern
      ) {


        const matches =

          corrected.match(
            pattern
          );



        if (
          matches
        ) {


          matches.forEach(

            function (
              match
            ) {


              const mac =

                normalizeMac(
                  match
                );



              if (
                mac
              ) {


                results.push({

                  mac:
                    mac,

                  score:
                    90,

                  labeled:
                    true,

                  corrected:
                    true

                });


              }


            }

          );


        }


      }

    );


  }



  return results;

}



/**
 * ==========================================================
 * SAFE OCR CORRECTIONS
 *
 * Applied only to MAC-labeled lines.
 * ==========================================================
 */

function applyMacOCRCorrections(
  value
) {


  return String(value)

    .toUpperCase()

    .replace(
      /O/g,
      '0'
    )

    .replace(
      /Q/g,
      '0'
    )

    .replace(
      /I/g,
      '1'
    )

    .replace(
      /L/g,
      '1'
    )

    .replace(
      /S/g,
      '5'
    )

    .replace(
      /G/g,
      '6'
    )

    .replace(
      /\|/g,
      '1'
    );

}



/**
 * ==========================================================
 * NORMALIZE MAC
 * ==========================================================
 */

function normalizeMac(
  value
) {


  if (
    !value
  ) {


    return null;


  }



  const clean =

    String(value)

      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );



  if (

    !/^[0-9A-F]{12}$/
      .test(
        clean
      )

  ) {


    return null;


  }



  return formatMac(
    clean
  );

}



/**
 * ==========================================================
 * FORMAT MAC
 * ==========================================================
 */

function formatMac(
  clean
) {


  return clean

    .match(
      /.{2}/g
    )

    .join(
      ':'
    );

}



/**
 * ==========================================================
 * MANUAL INPUT
 *
 * Manual entry is allowed to save,
 * but it is explicitly treated separately
 * from OCR confirmation.
 * ==========================================================
 */

function handleMacInput() {


  const input =

    document.getElementById(
      'macInput'
    );



  if (
    !input
  ) {


    return;


  }



  let raw =

    input
      .value
      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );



  raw =

    raw.substring(
      0,
      12
    );



  const groups =
    [];



  for (

    let i = 0;

    i < raw.length;

    i += 2

  ) {


    groups.push(

      raw.substring(

        i,

        i + 2

      )

    );


  }



  input.value =

    groups.join(
      ':'
    );



  /*
   * An input event means a human has edited the field.
   */

  macVerification = {

    mode:
      'manual',

    confirmed:
      false,

    confidence:
      'MANUAL',

    votes:
      '',

    mac:
      normalizeMac(
        input.value
      ) || ''

  };



  validateMacUI();

}



/**
 * ==========================================================
 * VERIFIED OCR UI
 * ==========================================================
 */

function updateVerifiedMacUI() {


  const input =

    document.getElementById(
      'macInput'
    );


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  const validation =

    document.getElementById(
      'macValidation'
    );



  const mac =

    normalizeMac(
      input.value
    );



  if (
    !mac
  ) {


    saveBtn.disabled =
      true;


    return;


  }



  input.value =
    mac;



  setMacState(

    'valid',

    'Confirmed MAC detected'

  );



  let status =

    'Confirmed MAC Address';



  if (
    macVerification.confidence
  ) {


    status +=

      ' • Confidence: ' +
      macVerification.confidence;


  }



  if (
    macVerification.votes
  ) {


    status +=

      ' • Confirmed: ' +
      macVerification.votes;


  }



  validation.textContent =
    status;



  validation.style.color =
    '#16864b';



  saveBtn.disabled =
    false;

}



/**
 * ==========================================================
 * VALIDATION
 * ==========================================================
 */

function validateMacUI() {


  const input =

    document.getElementById(
      'macInput'
    );


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  const validation =

    document.getElementById(
      'macValidation'
    );



  const mac =

    normalizeMac(
      input.value
    );



  if (
    mac
  ) {


    input.value =
      mac;



    /*
     * Confirmed OCR result.
     */

    if (
      macVerification.confirmed
    ) {


      updateVerifiedMacUI();


      return true;


    }



    /*
     * Manual entry.
     */

    if (
      macVerification.mode ===
      'manual'
    ) {


      setMacState(

        'valid',

        'Manual MAC entry'

      );



      validation.textContent =

        'Valid MAC Address • Manual entry';



      validation.style.color =
        '#16864b';



      saveBtn.disabled =
        false;



      return true;


    }


  }



  if (
    !input.value
  ) {


    validation.textContent =
      '';



    setMacState(

      'waiting',

      'Waiting for scan'

    );


  } else {


    validation.textContent =

      'Incomplete or invalid MAC Address';



    validation.style.color =
      '#d63b3b';



    setMacState(

      'invalid',

      'Invalid MAC'

    );


  }



  saveBtn.disabled =
    true;



  return false;

}



/**
 * ==========================================================
 * SAVE AND SCAN NEXT
 * ==========================================================
 */

function saveAndNext() {


  if (
    !validateMacUI()
  ) {


    showMessage(

      'Please enter or confirm a valid MAC Address.',

      'error'

    );


    return;


  }



  const btn =

    document.getElementById(
      'saveBtn'
    );



  btn.disabled =
    true;



  btn.textContent =
    'SAVING...';



  const params = {


    api:
      'v11',


    action:
      'saveMac',


    mac:

      document

        .getElementById(
          'macInput'
        )

        .value,


    device:

      document

        .getElementById(
          'deviceType'
        )

        .value,


    location:

      document

        .getElementById(
          'location'
        )

        .value,


    note:

      document

        .getElementById(
          'note'
        )

        .value


  };



  apiRequest(


    params,


    function (
      result
    ) {


      btn.textContent =
        'SAVE & SCAN NEXT';



      if (
        result.success
      ) {


        document

          .getElementById(
            'deviceCount'
          )

          .textContent =
          result.count;



        document

          .getElementById(
            'macInput'
          )

          .value =
          '';



        document

          .getElementById(
            'note'
          )

          .value =
          '';



        resetVerification();



        validateMacUI();



        showMessage(

          'Saved: ' +
          result.mac,

          'success'

        );



        vibrateSuccess();



        loadDashboard();



        window.scrollTo({

          top:
            0,

          behavior:
            'smooth'

        });


      } else if (

        result.type ===
        'duplicate'

      ) {


        btn.disabled =
          false;



        let message =

          'Duplicate: ' +
          result.mac;



        if (

          result.existing &&

          result.existing.location

        ) {


          message +=

            ' • Location: ' +

            result
              .existing
              .location;


        }



        if (

          result.existing &&

          result.existing.device

        ) {


          message +=

            ' • Device: ' +

            result
              .existing
              .device;


        }



        showMessage(

          message,

          'warning'

        );


      } else {


        btn.disabled =
          false;



        showMessage(

          result.message ||

          'Save failed.',

          'error'

        );


      }


    },


    function () {


      btn.textContent =
        'SAVE & SCAN NEXT';



      btn.disabled =
        false;


    }


  );

}



/**
 * ==========================================================
 * DASHBOARD
 * ==========================================================
 */

function loadDashboard() {


  apiRequest(


    {

      api:
        'v11',

      action:
        'dashboard'

    },


    function (
      data
    ) {


      if (
        !data.success
      ) {


        return;


      }



      document

        .getElementById(
          'deviceCount'
        )

        .textContent =

        data.count ||
        0;



      renderRecent(

        data.recent ||
        []

      );


    }


  );

}



/**
 * ==========================================================
 * JSONP API
 * ==========================================================
 */

function apiRequest(

  parameters,

  onSuccess,

  onError

) {


  if (

    API_URL.includes(
      'PASTE_YOUR'
    )

  ) {


    showMessage(

      'API URL has not been configured in app.js.',

      'error'

    );


    if (
      onError
    ) {


      onError();


    }


    return;

  }



  const callbackName =

    '__macCallback_' +

    Date.now() +

    '_' +

    Math.floor(

      Math.random() *
      100000

    );



  const script =

    document.createElement(
      'script'
    );



  let finished =
    false;



  const timeout =

    setTimeout(

      function () {


        if (
          finished
        ) {


          return;


        }



        finished =
          true;



        cleanup();



        showMessage(

          'Server timeout. Check the Apps Script deployment.',

          'error'

        );



        if (
          onError
        ) {


          onError();


        }


      },

      15000

    );



  function cleanup() {


    clearTimeout(
      timeout
    );



    delete window[
      callbackName
    ];



    if (
      script.parentNode
    ) {


      script
        .parentNode
        .removeChild(
          script
        );


    }


  }



  window[
    callbackName
  ] =

    function (
      data
    ) {


      if (
        finished
      ) {


        return;


      }



      finished =
        true;



      cleanup();



      if (
        onSuccess
      ) {


        onSuccess(
          data
        );


      }


    };



  parameters.callback =
    callbackName;



  const query =

    new URLSearchParams(
      parameters
    );



  script.src =

    API_URL +

    '?' +

    query.toString();



  script.onerror =

    function () {


      if (
        finished
      ) {


        return;


      }



      finished =
        true;



      cleanup();



      showMessage(

        'Could not connect to Apps Script.',

        'error'

      );



      if (
        onError
      ) {


        onError();


      }


    };



  document.body
    .appendChild(
      script
    );

}



/**
 * ==========================================================
 * RECENT SCANS
 * ==========================================================
 */

function renderRecent(
  items
) {


  const container =

    document.getElementById(
      'recentList'
    );



  if (

    !items ||

    items.length ===
    0

  ) {


    container.innerHTML =

      '<div class="emptyState">' +

      'No devices registered yet.' +

      '</div>';



    return;

  }



  container.innerHTML =

    items

      .map(

        function (
          item
        ) {


          return `

            <div class="recentItem">

              <div class="recentTop">

                <div class="recentMac">

                  ${escapeHtml(
                    item.mac
                  )}

                </div>

                <div class="recentDevice">

                  ${escapeHtml(
                    item.device ||
                    'Device'
                  )}

                </div>

              </div>

              <div class="recentBottom">

                <span>

                  ${escapeHtml(
                    item.location ||
                    'No location'
                  )}

                </span>

                <span>

                  ${escapeHtml(
                    item.timestamp
                  )}

                </span>

              </div>

            </div>

          `;


        }

      )

      .join(
        ''
      );

}



/**
 * ==========================================================
 * OCR STATUS
 * ==========================================================
 */

function setOCRStatus(

  show,

  title,

  progress

) {


  const box =

    document.getElementById(
      'ocrStatus'
    );



  if (
    !show
  ) {


    box.classList.add(
      'hidden'
    );


    return;

  }



  box.classList.remove(
    'hidden'
  );



  document

    .getElementById(
      'ocrTitle'
    )

    .textContent =

    title ||

    'Reading...';



  document

    .getElementById(
      'ocrProgress'
    )

    .textContent =

    progress ||

    '';

}



/**
 * ==========================================================
 * MAC STATE
 * ==========================================================
 */

function setMacState(

  type,

  text

) {


  const state =

    document.getElementById(
      'macState'
    );



  state.className =

    'macState ' +
    type;



  state.textContent =
    text;

}



/**
 * ==========================================================
 * SYSTEM STATUS
 * ==========================================================
 */

function setSystemStatus(

  text,

  ready

) {


  const status =

    document.getElementById(
      'systemStatus'
    );



  status.innerHTML =

    '<span class="statusDot"></span>' +

    escapeHtml(
      text
    );



  const dot =

    status.querySelector(
      '.statusDot'
    );



  dot.style.background =

    ready

      ? '#4cea92'

      : '#ff7474';

}



/**
 * ==========================================================
 * MESSAGE
 * ==========================================================
 */

function showMessage(

  message,

  type

) {


  const box =

    document.getElementById(
      'messageBox'
    );



  box.className =
    'messageBox';



  if (

    type ===
    'success'

  ) {


    box.classList.add(
      'messageSuccess'
    );


  } else if (

    type ===
    'warning'

  ) {


    box.classList.add(
      'messageWarning'
    );


  } else {


    box.classList.add(
      'messageError'
    );


  }



  box.textContent =
    message;



  box.classList.remove(
    'hidden'
  );



  setTimeout(

    function () {


      box.classList.add(
        'hidden'
      );


    },

    6500

  );

}



/**
 * ==========================================================
 * HAPTIC FEEDBACK
 * ==========================================================
 */

function vibrateSuccess() {


  if (
    navigator.vibrate
  ) {


    navigator.vibrate(

      [
        70,
        40,
        70
      ]

    );


  }

}



/**
 * ==========================================================
 * SECURITY
 * ==========================================================
 */

function escapeHtml(
  value
) {


  if (

    value === null ||

    value === undefined

  ) {


    return '';

  }



  return String(
    value
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );

}
