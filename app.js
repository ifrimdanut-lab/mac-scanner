/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * V1.1.0
 * External Camera Engine
 * ==========================================================
 */

const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbzDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';

let cameraStream = null;
let videoDevices = [];
let currentDeviceId = null;
let currentCameraIndex = 0;
let ocrWorker = null;
let ocrBusy = false;

document.addEventListener(
  'DOMContentLoaded',
  async function () {
    handleMacInput();
    loadDashboard();
    await discoverCameras();
  }
);

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
        function (device) {
          return (
            device.kind ===
            'videoinput'
          );
        }
      );

    populateCameraList();

  } catch (error) {
    console.error(
      'Camera discovery error:',
      error
    );
  }
}

function populateCameraList() {
  const select =
    document.getElementById(
      'cameraSelect'
    );

  const row =
    document.getElementById(
      'cameraSelectRow'
    );

  select.innerHTML = '';

  if (videoDevices.length === 0) {
    row.classList.add('hidden');
    return;
  }

  videoDevices.forEach(
    function (device, index) {
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

      select.appendChild(option);
    }
  );

  row.classList.remove('hidden');
}

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

    if (requestedDeviceId) {
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
      .add('hidden');

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

  } catch (error) {
    console.error(
      'Camera error:',
      error
    );

    handleCameraError(
      error
    );
  }
}

function stopCamera() {
  if (!cameraStream) {
    return;
  }

  cameraStream
    .getTracks()
    .forEach(
      function (track) {
        track.stop();
      }
    );

  cameraStream =
    null;
}

function handleCameraError(
  error
) {
  let message =
    'Camera could not be started.';

  switch (error.name) {
    case 'NotAllowedError':
      message =
        'Camera permission was denied. Please allow camera access in your browser settings.';
      break;

    case 'NotFoundError':
      message =
        'No camera was detected on this device.';
      break;

    case 'NotReadableError':
      message =
        'The camera may already be used by another application. Close other camera applications and try again.';
      break;

    case 'OverconstrainedError':
      message =
        'The selected camera is not available.';
      break;

    case 'SecurityError':
      message =
        'Camera access requires an HTTPS connection.';
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

async function changeCamera() {
  const select =
    document.getElementById(
      'cameraSelect'
    );

  if (!select.value) {
    return;
  }

  currentDeviceId =
    select.value;

  await startCamera(
    currentDeviceId
  );
}

function syncCameraSelector() {
  const select =
    document.getElementById(
      'cameraSelect'
    );

  if (currentDeviceId) {
    select.value =
      currentDeviceId;
  }
}

async function switchCamera() {
  if (videoDevices.length < 2) {
    showMessage(
      'Only one camera is available.',
      'warning'
    );
    return;
  }

  const currentIndex =
    videoDevices.findIndex(
      function (device) {
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

async function scanMac() {
  if (ocrBusy) {
    return;
  }

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
      0.90
    );

  const cropHeight =
    Math.floor(
      sourceHeight *
      0.50
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

  preprocessCanvas(
    canvas
  );

  await runOCR(
    canvas
  );
}

function scanUploadedPhoto(
  event
) {
  const file =
    event
      .target
      .files[0];

  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload =
    function (e) {
      const img =
        new Image();

      img.onload =
        async function () {
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
            1800;

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

          preprocessCanvas(
            canvas
          );

          await runOCR(
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

function preprocessCanvas(
  canvas
) {
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

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    const gray =
      data[i] * 0.299 +
      data[i + 1] * 0.587 +
      data[i + 2] * 0.114;

    const contrast =
      1.35;

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
}

async function getOCRWorker() {
  if (ocrWorker) {
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
            function (message) {
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

  return ocrWorker;
}

async function runOCR(
  image
) {
  if (ocrBusy) {
    return;
  }

  ocrBusy =
    true;

  document
    .getElementById(
      'scanBtn'
    )
    .disabled =
    true;

  setOCRStatus(
    true,
    'Reading image...',
    'Searching for MAC Address'
  );

  try {
    const worker =
      await getOCRWorker();

    const result =
      await worker
        .recognize(
          image
        );

    const text =
      result
        .data
        .text ||
      '';

    console.log(
      'OCR TEXT:',
      text
    );

    const mac =
      extractMacAddress(
        text
      );

    if (mac) {
      document
        .getElementById(
          'macInput'
        )
        .value =
        mac;

      validateMacUI();

      setOCRStatus(
        false
      );

      vibrateSuccess();

      showMessage(
        'MAC detected: ' +
        mac,
        'success'
      );

    } else {
      setOCRStatus(
        false
      );

      setMacState(
        'invalid',
        'MAC not detected'
      );

      showMessage(
        'MAC not detected. Move closer to the label and scan again.',
        'warning'
      );
    }

  } catch (error) {
    console.error(
      'OCR error:',
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

    if (cameraStream) {
      document
        .getElementById(
          'scanBtn'
        )
        .disabled =
        false;
    }
  }
}

function extractMacAddress(
  text
) {
  if (!text) {
    return null;
  }

  const upper =
    text.toUpperCase();

  const patterns = [
    /(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}/g,
    /\b[0-9A-F]{12}\b/g,
    /(?:[0-9A-F]{2}\s+){5}[0-9A-F]{2}/g
  ];

  for (
    const pattern
    of patterns
  ) {
    const matches =
      upper.match(
        pattern
      );

    if (matches) {
      for (
        const candidate
        of matches
      ) {
        const mac =
          normalizeMac(
            candidate
          );

        if (mac) {
          return mac;
        }
      }
    }
  }

  const lines =
    upper.split(
      /\r?\n/
    );

  const labels = [
    'MAC',
    'WLAN',
    'WIFI',
    'WI-FI',
    'WIRELESS',
    'ETHERNET',
    'LAN'
  ];

  for (
    let line
    of lines
  ) {
    const relevant =
      labels.some(
        function (
          label
        ) {
          return line.includes(
            label
          );
        }
      );

    if (!relevant) {
      continue;
    }

    let corrected =
      line
        .replace(
          /O/g,
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
        );

    const candidate =
      corrected.replace(
        /[^0-9A-F]/g,
        ''
      );

    for (
      let i = 0;
      i <=
        candidate.length -
        12;
      i++
    ) {
      const possible =
        candidate.substring(
          i,
          i + 12
        );

      const mac =
        normalizeMac(
          possible
        );

      if (mac) {
        return mac;
      }
    }
  }

  return null;
}

function normalizeMac(
  value
) {
  if (!value) {
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

  validateMacUI();
}

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

  if (mac) {
    input.value =
      mac;

    validation.textContent =
      'Valid MAC Address';

    validation.style.color =
      '#16864b';

    setMacState(
      'valid',
      'Valid MAC detected'
    );

    saveBtn.disabled =
      false;

    return true;
  }

  if (!input.value) {
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

function saveAndNext() {
  if (
    !validateMacUI()
  ) {
    showMessage(
      'Please enter a valid MAC Address.',
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

function renderRecent(
  items
) {
  const container =
    document.getElementById(
      'recentList'
    );

  if (
    !items ||
    items.length === 0
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
    5000
  );
}

function vibrateSuccess() {
  if (
    navigator.vibrate
  ) {
    navigator.vibrate(
      80
    );
  }
}

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
