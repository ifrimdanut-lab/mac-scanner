/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.5
 * Guided Capture Mode
 *
 * ==========================================================
 */


/**
 * ==========================================================
 * CONFIGURATION
 * ==========================================================
 *
 * IMPORTANT:
 *
 * Replace the value below with your real Apps Script
 * Web App URL ending in /exec
 */

const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbzDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';


const APP_VERSION =
  'V1.1.5';


const OCR_TIMEOUT_MS =
  12000;


/**
 * Crop dimensions relative to the live camera.
 *
 * These values correspond approximately
 * with the green guide in index.html.
 */

const GUIDE_WIDTH_RATIO =
  0.90;


const GUIDE_HEIGHT_RATIO =
  0.28;


/**
 * Static captured image is enlarged
 * before OCR.
 */

const OCR_SCALE =
  2.25;



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


let capturedImageReady =
  false;


let currentDetectedMac =
  null;


let macConfirmed =
  false;


let manualEdit =
  false;



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {


    updateVersionUI();


    resetMacState();


    loadDashboard();


    await discoverCameras();


  }

);



/**
 * ==========================================================
 * VERSION
 * ==========================================================
 */

function updateVersionUI() {


  const version =
    document.getElementById(
      'versionBadge'
    );


  if (
    version
  ) {

    version.textContent =
      APP_VERSION;

  }

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
 * CAMERA SELECT
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


    resetCaptureState();


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
        'captureBtn'
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



    const activeTrack =

      cameraStream
        .getVideoTracks()[0];



    const settings =

      activeTrack
        .getSettings();



    currentDeviceId =

      settings.deviceId ||
      null;



    await discoverCameras();


    syncCameraSelector();


    configureZoom(
      activeTrack
    );


    setSystemStatus(

      'Camera ready',

      true

    );


  } catch (
    error
  ) {


    console.error(
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
        'Camera permission was denied. Allow camera access in browser settings.';

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
 * SYNC CAMERA
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



  await startCamera(

    videoDevices[
      currentCameraIndex
    ].deviceId

  );

}



/**
 * ==========================================================
 * ZOOM CAPABILITIES
 * ==========================================================
 */

function configureZoom(
  track
) {


  const slider =

    document.getElementById(
      'zoomSlider'
    );


  if (
    !slider ||
    !track
  ) {

    return;

  }


  try {


    const capabilities =

      track.getCapabilities
        ? track.getCapabilities()
        : {};



    if (
      capabilities.zoom
    ) {


      slider.min =
        capabilities.zoom.min;


      slider.max =
        capabilities.zoom.max;


      slider.step =
        capabilities.zoom.step ||
        0.1;



      const settings =
        track.getSettings();



      const current =

        settings.zoom ||
        capabilities.zoom.min;



      slider.value =
        current;


      document

        .getElementById(
          'zoomValue'
        )

        .textContent =

        Number(
          current
        ).toFixed(
          1
        ) +
        '×';


      slider.disabled =
        false;


    } else {


      /*
       * Browser does not expose hardware zoom.
       *
       * We still retain the UI but use
       * CSS digital zoom for preview.
       */

      slider.min =
        1;


      slider.max =
        3;


      slider.step =
        0.1;


      slider.value =
        1;


      slider.disabled =
        false;


    }


  } catch (
    error
  ) {


    console.warn(
      'Zoom capability error:',
      error
    );


  }

}



/**
 * ==========================================================
 * CHANGE ZOOM
 * ==========================================================
 */

async function changeZoom() {


  const slider =

    document.getElementById(
      'zoomSlider'
    );


  const video =

    document.getElementById(
      'camera'
    );


  const zoom =

    Number(
      slider.value
    );


  document

    .getElementById(
      'zoomValue'
    )

    .textContent =

    zoom.toFixed(
      1
    ) +
    '×';



  if (
    !cameraStream
  ) {


    video.style.transform =

      'scale(' +
      zoom +
      ')';


    return;

  }



  const track =

    cameraStream
      .getVideoTracks()[0];


  try {


    const capabilities =

      track.getCapabilities
        ? track.getCapabilities()
        : {};



    if (
      capabilities.zoom
    ) {


      await track.applyConstraints({

        advanced: [

          {
            zoom:
              zoom
          }

        ]

      });


      video.style.transform =
        'scale(1)';


    } else {


      /*
       * Digital preview zoom.
       */

      video.style.transform =

        'scale(' +
        zoom +
        ')';


    }


  } catch (
    error
  ) {


    console.warn(

      'Hardware zoom unavailable.',

      error

    );


    video.style.transform =

      'scale(' +
      zoom +
      ')';


  }

}



/**
 * ==========================================================
 * GUIDED CAPTURE
 * ==========================================================
 */

function captureGuidedImage() {


  const video =

    document.getElementById(
      'camera'
    );


  if (

    !video.videoWidth ||

    !video.videoHeight

  ) {


    showMessage(

      'Camera is not ready.',

      'warning'

    );


    return;

  }



  const canvas =

    document.getElementById(
      'captureCanvas'
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



  const cropWidth =

    Math.floor(

      sourceWidth *
      GUIDE_WIDTH_RATIO

    );



  const cropHeight =

    Math.floor(

      sourceHeight *
      GUIDE_HEIGHT_RATIO

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

    Math.round(

      cropWidth *
      OCR_SCALE

    );



  canvas.height =

    Math.round(

      cropHeight *
      OCR_SCALE

    );



  ctx.imageSmoothingEnabled =
    true;


  ctx.imageSmoothingQuality =
    'high';



  ctx.drawImage(

    video,

    startX,

    startY,

    cropWidth,

    cropHeight,

    0,

    0,

    canvas.width,

    canvas.height

  );



  capturedImageReady =
    true;



  currentDetectedMac =
    null;


  macConfirmed =
    false;


  manualEdit =
    false;



  document

    .getElementById(
      'capturedSection'
    )

    .classList

    .remove(
      'hidden'
    );



  document

    .getElementById(
      'confirmPanel'
    )

    .classList

    .add(
      'hidden'
    );



  document

    .getElementById(
      'macInput'
    )

    .value =
    '';



  document

    .getElementById(
      'saveBtn'
    )

    .disabled =
    true;



  setMacState(

    'waiting',

    'Captured image ready'

  );



  document

    .getElementById(
      'macValidation'
    )

    .textContent =

    'Review the captured image, then press READ MAC.';



  document

    .getElementById(
      'capturedSection'
    )

    .scrollIntoView({

      behavior:
        'smooth',

      block:
        'start'

    });



  vibrateShort();

}



/**
 * ==========================================================
 * RETAKE
 * ==========================================================
 */

function retakePhoto() {


  capturedImageReady =
    false;


  currentDetectedMac =
    null;


  macConfirmed =
    false;


  manualEdit =
    false;



  document

    .getElementById(
      'capturedSection'
    )

    .classList

    .add(
      'hidden'
    );



  document

    .getElementById(
      'macInput'
    )

    .value =
    '';



  document

    .getElementById(
      'confirmPanel'
    )

    .classList

    .add(
      'hidden'
    );



  document

    .getElementById(
      'saveBtn'
    )

    .disabled =
    true;



  setMacState(

    'waiting',

    'Waiting for capture'

  );



  document

    .getElementById(
      'macValidation'
    )

    .textContent =
    '';



  window.scrollTo({

    top:
      0,

    behavior:
      'smooth'

  });

}



/**
 * ==========================================================
 * PHOTO / IMAGE INPUT
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

        function () {


          const canvas =

            document.getElementById(
              'captureCanvas'
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
            2400;



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



          capturedImageReady =
            true;



          currentDetectedMac =
            null;


          macConfirmed =
            false;


          manualEdit =
            false;



          document

            .getElementById(
              'capturedSection'
            )

            .classList

            .remove(
              'hidden'
            );



          document

            .getElementById(
              'macInput'
            )

            .value =
            '';



          setMacState(

            'waiting',

            'Photo ready'

          );



          document

            .getElementById(
              'macValidation'
            )

            .textContent =

            'Review the image, then press READ MAC.';



          document

            .getElementById(
              'capturedSection'
            )

            .scrollIntoView({

              behavior:
                'smooth',

              block:
                'start'

            });


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
 * OCR ENTRY
 * ==========================================================
 */

async function readCapturedMac() {


  if (
    !capturedImageReady
  ) {


    showMessage(

      'Capture an image first.',

      'warning'

    );


    return;

  }



  if (
    ocrBusy
  ) {


    return;

  }



  ocrBusy =
    true;



  currentDetectedMac =
    null;


  macConfirmed =
    false;


  manualEdit =
    false;



  const readButton =

    document.getElementById(
      'readMacBtn'
    );



  readButton.disabled =
    true;



  try {


    const sourceCanvas =

      document.getElementById(
        'captureCanvas'
      );



    const worker =
      await getOCRWorker();



    const variants = [

      {
        name:
          'Original',

        canvas:
          cloneCanvas(
            sourceCanvas
          )
      },

      {
        name:
          'Contrast',

        canvas:
          createContrastCanvas(
            sourceCanvas
          )
      },

      {
        name:
          'Sharp',

        canvas:
          createSharpCanvas(
            sourceCanvas
          )
      }

    ];



    const candidates =
      [];



    for (

      let i = 0;

      i <
      variants.length;

      i++

    ) {


      setOCRStatus(

        true,

        'Reading captured image...',

        variants[i].name +
        ' • ' +
        (i + 1) +
        '/' +
        variants.length

      );



      try {


        const result =

          await recognizeWithTimeout(

            worker,

            variants[i].canvas

          );



        const text =

          result &&
          result.data

            ? result.data.text || ''

            : '';



        console.log(

          'OCR ' +
          variants[i].name +
          ':',

          text

        );



        const detected =

          extractMacCandidates(
            text
          );



        detected.forEach(

          function (
            candidate
          ) {


            candidates.push({

              mac:
                candidate.mac,

              score:
                candidate.score,

              variant:
                variants[i].name

            });


          }

        );


      } catch (
        error
      ) {


        console.warn(

          'OCR pass failed:',

          error

        );


      }


    }



    const winner =

      selectBestCandidate(
        candidates
      );



    if (
      !winner
    ) {


      currentDetectedMac =
        null;



      setMacState(

        'invalid',

        'MAC NOT DETECTED'

      );



      document

        .getElementById(
          'macValidation'
        )

        .textContent =

        'OCR could not read a reliable MAC. Retake closer or enter it manually.';



      document

        .getElementById(
          'confirmPanel'
        )

        .classList

        .add(
          'hidden'
        );



      showMessage(

        'MAC not detected. Retake the image closer and make sure only the MAC line is inside the guide.',

        'warning'

      );



      return;

    }



    currentDetectedMac =
      winner.mac;



    const input =

      document.getElementById(
        'macInput'
      );



    input.value =
      winner.mac;



    setMacState(

      'candidate',

      'OCR CANDIDATE'

    );



    document

      .getElementById(
        'macValidation'
      )

      .textContent =

      'OCR candidate detected. Compare it carefully with the captured image.';



    document

      .getElementById(
        'confirmPanel'
      )

      .classList

      .remove(
        'hidden'
      );



    document

      .getElementById(
        'saveBtn'
      )

      .disabled =
      true;



    showMessage(

      'OCR detected: ' +
      winner.mac +
      '. Please visually confirm it.',

      'warning'

    );



    document

      .getElementById(
        'macInput'
      )

      .scrollIntoView({

        behavior:
          'smooth',

        block:
          'center'

      });


  } catch (
    error
  ) {


    console.error(
      error
    );



    showMessage(

      'OCR error: ' +
      error.message,

      'error'

    );


  } finally {


    setOCRStatus(
      false
    );


    ocrBusy =
      false;


    readButton.disabled =
      false;


  }

}



/**
 * ==========================================================
 * USER CONFIRMATION
 * ==========================================================
 */

function confirmDetectedMac() {


  const input =

    document.getElementById(
      'macInput'
    );



  const mac =

    normalizeMac(
      input.value
    );



  if (
    !mac
  ) {


    showMessage(

      'The MAC Address is not valid.',

      'error'

    );


    return;

  }



  currentDetectedMac =
    mac;


  macConfirmed =
    true;


  manualEdit =
    false;



  input.value =
    mac;



  setMacState(

    'valid',

    'VISUALLY VERIFIED'

  );



  document

    .getElementById(
      'macValidation'
    )

    .textContent =

    'MAC confirmed by user • Ready to save.';



  document

    .getElementById(
      'macValidation'
    )

    .style.color =
    '#16864b';



  document

    .getElementById(
      'confirmPanel'
    )

    .classList

    .add(
      'hidden'
    );



  document

    .getElementById(
      'saveBtn'
    )

    .disabled =
    false;



  vibrateSuccess();



  showMessage(

    'MAC confirmed: ' +
    mac,

    'success'

  );

}



/**
 * ==========================================================
 * MANUAL INPUT
 * ==========================================================
 */

function handleMacInput() {


  const input =

    document.getElementById(
      'macInput'
    );



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
   * If user edits OCR result,
   * previous visual confirmation is invalidated.
   */

  macConfirmed =
    false;


  manualEdit =
    true;



  const mac =

    normalizeMac(
      input.value
    );



  if (
    mac
  ) {


    input.value =
      mac;



    setMacState(

      'candidate',

      'MANUAL / EDITED MAC'

    );



    document

      .getElementById(
        'macValidation'
      )

      .textContent =

      'Valid format. Verify it visually and press MAC IS CORRECT.';



    document

      .getElementById(
        'macValidation'
      )

      .style.color =
      '#84590b';



    document

      .getElementById(
        'confirmPanel'
      )

      .classList

      .remove(
        'hidden'
      );



  } else {


    document

      .getElementById(
        'confirmPanel'
      )

      .classList

      .add(
        'hidden'
      );



    document

      .getElementById(
        'saveBtn'
      )

      .disabled =
      true;



    if (
      input.value
    ) {


      setMacState(

        'invalid',

        'INVALID FORMAT'

      );



      document

        .getElementById(
          'macValidation'
        )

        .textContent =

        'Incomplete or invalid MAC Address.';


    } else {


      setMacState(

        'waiting',

        capturedImageReady
          ? 'Waiting for OCR'
          : 'Waiting for capture'

      );



      document

        .getElementById(
          'macValidation'
        )

        .textContent =
        '';


    }


  }

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

    'First use may take a few seconds.'

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


                const percent =

                  Math.round(

                    message.progress *
                    100

                  );



                if (
                  percent > 0
                ) {


                  document

                    .getElementById(
                      'ocrProgress'
                    )

                    .textContent =

                    message.status +
                    ' ' +
                    percent +
                    '%';


                }


              }


            }


        }

      );



  await ocrWorker.setParameters({

    preserve_interword_spaces:
      '1',

    tessedit_pageseg_mode:
      '6'

  });



  return ocrWorker;

}



/**
 * ==========================================================
 * OCR TIMEOUT
 * ==========================================================
 */

function recognizeWithTimeout(

  worker,

  image

) {


  return Promise.race([


    worker.recognize(
      image
    ),


    new Promise(

      function (
        resolve,
        reject
      ) {


        setTimeout(

          function () {


            reject(

              new Error(
                'OCR timeout'
              )

            );


          },

          OCR_TIMEOUT_MS

        );


      }

    )


  ]);

}



/**
 * ==========================================================
 * MAC EXTRACTION
 * ==========================================================
 */

function extractMacCandidates(
  text
) {


  if (
    !text
  ) {


    return [];

  }



  const source =

    String(text)
      .toUpperCase();



  const candidates =
    [];



  /**
   * Exact colon format
   */

  addMatches(

    candidates,

    source,

    /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,

    120

  );



  /**
   * Dash format
   */

  addMatches(

    candidates,

    source,

    /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,

    115

  );



  /**
   * Spaces
   */

  addMatches(

    candidates,

    source,

    /(?:[0-9A-F]{2}\s+){5}[0-9A-F]{2}/g,

    105

  );



  /**
   * Cisco format
   */

  addMatches(

    candidates,

    source,

    /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g,

    105

  );



  /**
   * OCR tolerant colon/dash format.
   *
   * Example:
   * 48:EA:62:CB:B6:8O
   */

  const tolerant =

    source.match(

      /(?:[0-9A-Z]{2}[:\-]){5}[0-9A-Z]{2}/g

    );



  if (
    tolerant
  ) {


    tolerant.forEach(

      function (
        raw
      ) {


        const corrected =

          correctSeparatedMacOCR(
            raw
          );



        if (
          corrected
        ) {


          candidates.push({

            mac:
              corrected,

            score:
              90

          });


        }


      }

    );


  }



  /**
   * Compact MAC.
   *
   * Accepted only when OCR text contains
   * a MAC-related keyword.
   */

  if (
    containsMacKeyword(
      source
    )
  ) {


    const compact =

      source.match(
        /\b[0-9A-F]{12}\b/g
      );



    if (
      compact
    ) {


      compact.forEach(

        function (
          value
        ) {


          const mac =

            normalizeMac(
              value
            );



          if (
            mac
          ) {


            candidates.push({

              mac:
                mac,

              score:
                85

            });


          }


        }

      );


    }


  }



  return candidates;

}



/**
 * ==========================================================
 * ADD PATTERN MATCHES
 * ==========================================================
 */

function addMatches(

  list,

  source,

  regex,

  score

) {


  const matches =

    source.match(
      regex
    );



  if (
    !matches
  ) {


    return;


  }



  matches.forEach(

    function (
      value
    ) {


      const mac =

        normalizeMac(
          value
        );



      if (
        mac
      ) {


        list.push({

          mac:
            mac,

          score:
            score

        });


      }


    }

  );

}



/**
 * ==========================================================
 * OCR CHARACTER CORRECTION
 *
 * Applied only to strings already shaped
 * like a MAC with separators.
 * ==========================================================
 */

function correctSeparatedMacOCR(
  raw
) {


  const groups =

    String(raw)

      .toUpperCase()

      .split(
        /[:-]/
      );



  if (
    groups.length !==
    6
  ) {


    return null;


  }



  const conversion = {

    O:
      '0',

    Q:
      '0',

    I:
      '1',

    L:
      '1',

    S:
      '5',

    G:
      '6'

  };



  const result =
    [];



  for (
    const group
    of groups
  ) {


    if (
      group.length !==
      2
    ) {


      return null;


    }



    let converted =
      '';



    for (
      const char
      of group
    ) {


      if (
        /[0-9A-F]/
          .test(
            char
          )
      ) {


        converted +=
          char;


      } else if (
        conversion[
          char
        ]
      ) {


        converted +=
          conversion[
            char
          ];


      } else {


        return null;


      }


    }



    result.push(
      converted
    );


  }



  return normalizeMac(

    result.join(
      ':'
    )

  );

}



/**
 * ==========================================================
 * KEYWORD CHECK
 * ==========================================================
 */

function containsMacKeyword(
  text
) {


  const keywords = [

    'MAC',

    'MAC ADDRESS',

    'PHYSICAL ADDRESS',

    'WLAN',

    'WIRELESS',

    'WIFI',

    'WI-FI',

    'ETHERNET'

  ];



  return keywords.some(

    function (
      keyword
    ) {


      return text.includes(
        keyword
      );


    }

  );

}



/**
 * ==========================================================
 * SELECT BEST OCR CANDIDATE
 * ==========================================================
 */

function selectBestCandidate(
  candidates
) {


  if (

    !candidates ||

    candidates.length ===
    0

  ) {


    return null;


  }



  const table =
    {};



  candidates.forEach(

    function (
      item
    ) {


      if (
        !table[
          item.mac
        ]
      ) {


        table[
          item.mac
        ] = {

          mac:
            item.mac,

          votes:
            0,

          score:
            0

        };


      }



      table[
        item.mac
      ].votes++;



      table[
        item.mac
      ].score +=
        item.score;


    }

  );



  const list =

    Object.values(
      table
    );



  list.sort(

    function (
      a,
      b
    ) {


      if (
        b.votes !==
        a.votes
      ) {


        return (
          b.votes -
          a.votes
        );


      }



      return (
        b.score -
        a.score
      );


    }

  );



  const winner =
    list[0];



  /**
   * Safety:
   *
   * If two different MACs have equal vote count
   * and very similar scores, do not guess.
   */

  if (
    list.length > 1
  ) {


    const second =
      list[1];



    if (

      winner.votes ===
      second.votes &&

      Math.abs(
        winner.score -
        second.score
      ) < 15

    ) {


      return null;


    }


  }



  return winner;

}



/**
 * ==========================================================
 * IMAGE CLONE
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
 * CONTRAST
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
    1.45;



  for (

    let i = 0;

    i < data.length;

    i += 4

  ) {


    const gray =

      data[i] *
      .299

      +

      data[i + 1] *
      .587

      +

      data[i + 2] *
      .114;



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
 * SHARPEN
 * ==========================================================
 */

function createSharpCanvas(
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



  /**
   * Browser-safe lightweight sharpening:
   * draw enlarged image over itself
   * with contrast filter.
   */

  ctx.filter =
    'contrast(145%) brightness(105%)';



  ctx.drawImage(

    source,

    0,

    0,

    canvas.width,

    canvas.height

  );



  ctx.filter =
    'none';



  return canvas;

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
 * RESET CAPTURE STATE
 * ==========================================================
 */

function resetCaptureState() {


  capturedImageReady =
    false;


  currentDetectedMac =
    null;


  macConfirmed =
    false;


  manualEdit =
    false;



  document

    .getElementById(
      'capturedSection'
    )

    .classList

    .add(
      'hidden'
    );



  document

    .getElementById(
      'confirmPanel'
    )

    .classList

    .add(
      'hidden'
    );


  resetMacState();

}



/**
 * ==========================================================
 * RESET MAC STATE
 * ==========================================================
 */

function resetMacState() {


  const input =

    document.getElementById(
      'macInput'
    );


  if (
    input
  ) {


    input.value =
      '';


  }



  const save =

    document.getElementById(
      'saveBtn'
    );


  if (
    save
  ) {


    save.disabled =
      true;


  }



  const validation =

    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {


    validation.textContent =
      '';


  }



  setMacState(

    'waiting',

    'Waiting for capture'

  );

}



/**
 * ==========================================================
 * SAVE
 * ==========================================================
 */

function saveAndNext() {


  const mac =

    normalizeMac(

      document

        .getElementById(
          'macInput'
        )

        .value

    );



  if (
    !mac
  ) {


    showMessage(

      'Invalid MAC Address.',

      'error'

    );


    return;

  }



  if (
    !macConfirmed
  ) {


    showMessage(

      'Please visually confirm the MAC before saving.',

      'warning'

    );


    return;

  }



  const button =

    document.getElementById(
      'saveBtn'
    );



  button.disabled =
    true;


  button.textContent =
    'SAVING...';



  const params = {

    api:
      'v11',

    action:
      'saveMac',

    mac:
      mac,

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


      button.textContent =
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
            'note'
          )

          .value =
          '';



        resetCaptureState();



        showMessage(

          'Saved: ' +
          result.mac,

          'success'

        );



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


        button.disabled =
          false;



        let message =

          'Duplicate MAC: ' +
          result.mac;



        if (
          result.existing
        ) {


          if (
            result.existing.device
          ) {


            message +=

              ' • ' +
              result.existing.device;


          }



          if (
            result.existing.location
          ) {


            message +=

              ' • ' +
              result.existing.location;


          }


        }



        showMessage(

          message,

          'warning'

        );


      } else {


        button.disabled =
          false;



        showMessage(

          result.message ||
          'Save failed.',

          'error'

        );


      }


    },

    function () {


      button.textContent =
        'SAVE & SCAN NEXT';


      button.disabled =
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
 * API
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

          'Server timeout.',

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
 * RECENT LIST
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
 * UI STATE
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



  if (
    !state
  ) {


    return;


  }



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
 * MESSAGES
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
 * HAPTICS
 * ==========================================================
 */

function vibrateShort() {


  if (
    navigator.vibrate
  ) {


    navigator.vibrate(
      50
    );


  }

}



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



  return String(value)

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
