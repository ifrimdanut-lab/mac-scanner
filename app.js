/**
 * ==========================================================
 * ICHC MAC Scanner
 * Version V1.3.2.3
 *
 * LAYOUT:
 * 1. LIVE MAC SCAN
 * 2. CAMERA VIEW
 * 3. LARGE MAC RESULT
 * 4. OCR RESULT / DEVICE DATA
 * 5. REMAINING CAMERA CONTROLS / OTHER CONTENT
 * 6. LOCAL PADDLEOCR - LAST
 *
 * OCR engine / speed unchanged from V1.3.0.
 * ==========================================================
 */

const APP_VERSION = 'V1.3.2.3';


/* ==========================================================
   BACKENDS
========================================================== */

const GOOGLE_API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbymTgShnoA9obZCt3lse6UzGnbYk26skD9CgxJPciPnsUKr7AQ0OlL72PJLUSkvZ3U7iQ/exec';


const OCR_CONNECTION_NAME =
  'Tailscale';


const OCR_API_URL_RAW =
  'https://pc-home.tail51a762.ts.net';


const OCR_API_URL =
  normalizeOCRBaseURL(
    OCR_API_URL_RAW
  );


/* ==========================================================
   LIVE SCAN SETTINGS
========================================================== */

const LIVE_SCAN_INTERVAL_MS =
  450;


const LIVE_CONFIRMATION_COUNT =
  2;


const LIVE_CAPTURE_MAX_WIDTH =
  1000;


const LIVE_JPEG_QUALITY =
  0.82;


/* ==========================================================
   GLOBAL STATE
========================================================== */

let scanMode =
  'screen';


let cameraStream =
  null;


let videoDevices =
  [];


let currentDeviceId =
  null;


let ocrBusy =
  false;


let macConfirmed =
  false;


let liveScanEnabled =
  false;


let liveScanTimer =
  null;


let liveCandidateMac =
  null;


let liveCandidateCount =
  0;


let liveScanNumber =
  0;


/* ==========================================================
   STARTUP
========================================================== */

document.addEventListener(
  'DOMContentLoaded',
  async function () {

    console.log(
      'ICHC MAC Scanner',
      APP_VERSION
    );


    console.log(
      'OCR Connection:',
      OCR_CONNECTION_NAME
    );


    console.log(
      'OCR Base URL:',
      OCR_API_URL
    );


    createCompactMacResultUI();

    createLiveScanUI();

    reorderApplicationLayout();

    renderConnectionInfo();


    setScanMode(
      'screen'
    );


    resetMacState();


    loadDashboard();


    await discoverCameras();


    checkOCRServer();
  }
);


/* ==========================================================
   V1.3.2.3 - EXACT LAYOUT REORDER
========================================================== */

function reorderApplicationLayout() {

  arrangePrimaryScannerFlow();

  movePaddleOCRSectionToBottom();

  moveRecentScansSectionToBottom();
}


/*
 * Finds common parent containing both
 * the camera display and camera controls.
 */

function findScannerWorkspace() {

  const camera =
    document.getElementById(
      'camera'
    );


  const startButton =
    document.getElementById(
      'startCameraBtn'
    );


  if (
    !camera ||
    !startButton
  ) {

    return null;
  }


  let node =
    camera.parentElement;


  while (
    node &&
    node !== document.body
  ) {

    if (
      node.contains(
        startButton
      )
    ) {

      return node;
    }


    node =
      node.parentElement;
  }


  return null;
}


/*
 * Returns direct child of ancestor
 * containing the requested element.
 */

function directChildInside(
  element,
  ancestor
) {

  if (
    !element ||
    !ancestor ||
    !ancestor.contains(
      element
    )
  ) {

    return null;
  }


  let current =
    element;


  while (
    current.parentElement &&
    current.parentElement !== ancestor
  ) {

    current =
      current.parentElement;
  }


  return current;
}


/*
 * Find camera display block only.
 */

function findCameraViewBlock(
  workspace
) {

  const camera =
    document.getElementById(
      'camera'
    );


  if (
    !camera ||
    !workspace
  ) {

    return null;
  }


  return directChildInside(
    camera,
    workspace
  );
}


/* ==========================================================
   FIND OCR RESULT
========================================================== */

function findOCRResultCard() {

  const macInput =
    document.getElementById(
      'macInput'
    );


  if (
    macInput
  ) {

    let current =
      macInput.parentElement;


    while (
      current &&
      current !== document.body
    ) {

      const heading =
        current.querySelector(
          'h1, h2, h3, h4, h5, h6'
        );


      if (
        heading &&
        String(
          heading.textContent || ''
        )
          .trim()
          .toLowerCase()
          .includes(
            'ocr result'
          )
      ) {

        return current;
      }


      current =
        current.parentElement;
    }
  }


  return findSectionByHeadingText(
    'OCR Result'
  );
}


/* ==========================================================
   EXACT MAIN FLOW
========================================================== */

function arrangePrimaryScannerFlow() {

  const workspace =
    findScannerWorkspace();


  const livePanel =
    document.getElementById(
      'liveScanPanel'
    );


  const compact =
    document.getElementById(
      'compactMacResult'
    );


  const ocrResult =
    findOCRResultCard();


  if (
    !workspace
  ) {

    console.warn(
      'V1.3.2.2: Scanner workspace not found.'
    );

    return;
  }


  const cameraView =
    findCameraViewBlock(
      workspace
    );


  if (
    !livePanel ||
    !cameraView ||
    !compact ||
    !ocrResult
  ) {

    console.warn(
      'V1.3.2.2: Exact scanner flow could not be built.',
      {
        livePanel:
          Boolean(
            livePanel
          ),

        cameraView:
          Boolean(
            cameraView
          ),

        compact:
          Boolean(
            compact
          ),

        ocrResult:
          Boolean(
            ocrResult
          )
      }
    );


    return;
  }


  /*
   * 1. LIVE MAC SCAN first
   */

  workspace.insertBefore(
    livePanel,
    workspace.firstElementChild
  );


  /*
   * 2. CAMERA immediately after LIVE
   */

  livePanel.insertAdjacentElement(
    'afterend',
    cameraView
  );


  /*
   * 3. LARGE MAC immediately after camera
   */

  cameraView.insertAdjacentElement(
    'afterend',
    compact
  );


  /*
   * 4. OCR Result immediately after MAC
   */

  compact.insertAdjacentElement(
    'afterend',
    ocrResult
  );


  livePanel.style.marginTop =
    '0';


  livePanel.style.marginBottom =
    '10px';


  cameraView.style.marginTop =
    '0';


  cameraView.style.marginBottom =
    '10px';


  compact.style.marginTop =
    '0';


  compact.style.marginBottom =
    '10px';


  ocrResult.style.marginTop =
    '0';


  ocrResult.style.marginBottom =
    '12px';


  console.log(
    'V1.3.2.2 layout: LIVE → CAMERA → MAC → OCR RESULT.'
  );
}


/* ==========================================================
   FIND SECTION BY HEADING
========================================================== */

function findSectionByHeadingText(
  searchText
) {

  const wanted =
    String(
      searchText || ''
    )
      .trim()
      .toLowerCase();


  if (
    !wanted
  ) {

    return null;
  }


  const headings =
    document.querySelectorAll(
      'h1, h2, h3, h4, h5, h6'
    );


  for (
    const heading of headings
  ) {

    const text =
      String(
        heading.textContent || ''
      )
        .trim()
        .toLowerCase();


    if (
      text === wanted ||
      text.includes(
        wanted
      )
    ) {

      const card =
        heading.closest(
          '.card, .section, .panel, .contentCard, .scannerCard'
        );


      if (
        card
      ) {

        return card;
      }


      if (
        heading.parentElement
      ) {

        return heading.parentElement;
      }
    }
  }


  return null;
}


/* ==========================================================
   LOCAL PADDLEOCR -> LAST
========================================================== */

function findPaddleOCRCard() {

  const serverPanel =
    document.getElementById(
      'ocrServerPanel'
    );


  if (
    serverPanel
  ) {

    let current =
      serverPanel.parentElement;


    while (
      current &&
      current !== document.body
    ) {

      const heading =
        current.querySelector(
          'h1, h2, h3, h4, h5, h6'
        );


      if (
        heading &&
        String(
          heading.textContent || ''
        )
          .trim()
          .toLowerCase()
          .includes(
            'local paddleocr'
          )
      ) {

        return current;
      }


      current =
        current.parentElement;
    }
  }


  return findSectionByHeadingText(
    'Local PaddleOCR'
  );
}


function movePaddleOCRSectionToBottom() {

  const paddleCard =
    findPaddleOCRCard();


  if (
    !paddleCard ||
    !paddleCard.parentElement
  ) {

    console.warn(
      'V1.3.2.2: Local PaddleOCR section not found.'
    );

    return;
  }


  paddleCard.parentElement.appendChild(
    paddleCard
  );


  paddleCard.style.marginTop =
    '20px';


  paddleCard.style.marginBottom =
    '20px';
}


/* ==========================================================
   RECENT SCANS -> LAST
========================================================== */

function moveRecentScansSectionToBottom() {

  const recentCard =
    findSectionByHeadingText(
      'Recent Scans'
    );


  if (
    !recentCard ||
    !recentCard.parentElement
  ) {

    console.warn(
      'V1.3.2.3: Recent Scans section not found.'
    );

    return;
  }


  recentCard.parentElement.appendChild(
    recentCard
  );


  recentCard.style.marginTop =
    '20px';


  recentCard.style.marginBottom =
    '20px';
}


/* ==========================================================
   COMPACT MAC RESULT
========================================================== */

function createCompactMacResultUI() {

  const oldPanel =
    document.getElementById(
      'compactMacResult'
    );


  if (
    oldPanel
  ) {

    oldPanel.remove();
  }


  const startCameraButton =
    document.getElementById(
      'startCameraBtn'
    );


  if (
    !startCameraButton
  ) {

    console.warn(
      'START CAMERA button not found.'
    );

    return;
  }


  const buttonRow =
    startCameraButton.parentElement;


  if (
    !buttonRow ||
    !buttonRow.parentElement
  ) {

    console.warn(
      'Camera button row could not be located.'
    );

    return;
  }


  const panel =
    document.createElement(
      'div'
    );


  panel.id =
    'compactMacResult';


  panel.style.width =
    '100%';


  panel.style.boxSizing =
    'border-box';


  panel.style.marginTop =
    '10px';


  panel.style.marginBottom =
    '10px';


  panel.innerHTML = `

    <div
      id="compactMacResultBox"
      style="
        width:100%;
        box-sizing:border-box;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        min-height:64px;
        padding:12px 16px;
        border:2px solid #dbe4ef;
        border-radius:12px;
        background:#ffffff;
        transition:
          border-color .2s ease,
          background .2s ease,
          box-shadow .2s ease;
      "
    >

      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div
          style="
            font-size:10px;
            line-height:1;
            font-weight:800;
            letter-spacing:.9px;
            color:#8997a8;
            margin-bottom:7px;
          "
        >
          MAC ADDRESS
        </div>

        <div
          id="compactMacText"
          style="
            font-size:22px;
            line-height:1.15;
            font-weight:800;
            letter-spacing:.4px;
            color:#6f7f91;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          Waiting for MAC...
        </div>

      </div>

      <div
        id="compactMacIcon"
        style="
          width:38px;
          height:38px;
          flex:0 0 38px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:#eef3f8;
          color:#8c9bab;
          font-size:20px;
          font-weight:900;
        "
      >
        …
      </div>

    </div>
  `;


  buttonRow.parentElement.insertBefore(
    panel,
    buttonRow
  );


  updateCompactMacResult(
    null,
    'waiting'
  );
}


/* ==========================================================
   UPDATE COMPACT MAC RESULT
========================================================== */

function updateCompactMacResult(
  mac,
  state = 'waiting'
) {

  const box =
    document.getElementById(
      'compactMacResultBox'
    );


  const text =
    document.getElementById(
      'compactMacText'
    );


  const icon =
    document.getElementById(
      'compactMacIcon'
    );


  if (
    !box ||
    !text ||
    !icon
  ) {

    return;
  }


  if (
    state ===
    'detected'
  ) {

    text.textContent =
      mac ||
      'MAC detected';


    text.style.color =
      '#0878ff';


    box.style.borderColor =
      '#0878ff';


    box.style.background =
      '#f5faff';


    box.style.boxShadow =
      '0 3px 14px rgba(8,120,255,.10)';


    icon.textContent =
      '✓';


    icon.style.background =
      '#e5f7ed';


    icon.style.color =
      '#16864b';


    return;
  }


  if (
    state ===
    'confirmed'
  ) {

    text.textContent =
      mac ||
      'MAC confirmed';


    text.style.color =
      '#16864b';


    box.style.borderColor =
      '#58c98a';


    box.style.background =
      '#f3fcf7';


    box.style.boxShadow =
      '0 3px 14px rgba(22,134,75,.10)';


    icon.textContent =
      '✓';


    icon.style.background =
      '#dff6e9';


    icon.style.color =
      '#16864b';


    return;
  }


  if (
    state ===
    'scanning'
  ) {

    text.textContent =
      mac ||
      'Scanning...';


    text.style.color =
      '#0878ff';


    box.style.borderColor =
      '#8dc3ff';


    box.style.background =
      '#f8fbff';


    box.style.boxShadow =
      'none';


    icon.textContent =
      '⌁';


    icon.style.background =
      '#eaf4ff';


    icon.style.color =
      '#0878ff';


    return;
  }


  if (
    state ===
    'error'
  ) {

    text.textContent =
      mac ||
      'MAC not found';


    text.style.color =
      '#d63b3b';


    box.style.borderColor =
      '#efb2b2';


    box.style.background =
      '#fff8f8';


    box.style.boxShadow =
      'none';


    icon.textContent =
      '!';


    icon.style.background =
      '#fde7e7';


    icon.style.color =
      '#d63b3b';


    return;
  }


  text.textContent =
    'Waiting for MAC...';


  text.style.color =
    '#6f7f91';


  box.style.borderColor =
    '#dbe4ef';


  box.style.background =
    '#ffffff';


  box.style.boxShadow =
    'none';


  icon.textContent =
    '…';


  icon.style.background =
    '#eef3f8';


  icon.style.color =
    '#8c9bab';
}


/* ==========================================================
   LIVE SCAN UI
========================================================== */

function createLiveScanUI() {

  const old =
    document.getElementById(
      'liveScanPanel'
    );


  if (
    old
  ) {

    old.remove();
  }


  const panel =
    document.createElement(
      'div'
    );


  panel.id =
    'liveScanPanel';


  panel.style.width =
    '100%';


  panel.style.boxSizing =
    'border-box';


  panel.style.marginBottom =
    '14px';


  panel.style.padding =
    '12px';


  panel.style.border =
    '1px solid #dbe4ef';


  panel.style.borderRadius =
    '12px';


  panel.style.background =
    '#f8fbff';


  panel.innerHTML = `

    <div
      style="
        font-size:11px;
        font-weight:800;
        letter-spacing:.7px;
        color:#526273;
        margin-bottom:7px;
      "
    >
      LIVE MAC SCAN
    </div>

    <button
      id="liveScanBtn"
      type="button"
      onclick="toggleLiveScan()"
      style="
        width:100%;
        min-height:44px;
        border:0;
        border-radius:9px;
        background:#0878ff;
        color:white;
        font-weight:800;
        cursor:pointer;
      "
    >
      START LIVE SCAN
    </button>

    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top:8px;
      "
    >

      <div
        id="liveScanStatus"
        style="
          font-size:12px;
          color:#526273;
        "
      >
        READY
      </div>

      <div
        id="liveConsensus"
        style="
          font-size:11px;
          color:#738398;
          white-space:nowrap;
        "
      >
        0 / ${LIVE_CONFIRMATION_COUNT}
      </div>

    </div>

  `;


  const startCamera =
    document.getElementById(
      'startCameraBtn'
    );


  if (
    startCamera &&
    startCamera.parentElement &&
    startCamera.parentElement.parentElement
  ) {

    startCamera
      .parentElement
      .parentElement
      .insertBefore(
        panel,
        startCamera
          .parentElement
          .parentElement
          .firstElementChild
      );
  }
}


/* ==========================================================
   CONNECTION INFORMATION
========================================================== */

function renderConnectionInfo() {

  const existing =
    document.getElementById(
      'ocrConnectionInfo'
    );


  if (
    existing
  ) {

    existing.remove();
  }


  const panel =
    document.getElementById(
      'ocrServerPanel'
    );


  if (
    !panel
  ) {

    return;
  }


  const info =
    document.createElement(
      'div'
    );


  info.id =
    'ocrConnectionInfo';


  info.style.marginTop =
    '8px';


  info.style.paddingTop =
    '8px';


  info.style.borderTop =
    '1px solid rgba(0,0,0,0.08)';


  info.style.fontSize =
    '12px';


  info.style.lineHeight =
    '1.6';


  info.style.color =
    '#526273';


  info.innerHTML =

    '<div>' +

      '<strong>Connection:</strong> ' +

      escapeHtml(
        OCR_CONNECTION_NAME
      ) +

    '</div>' +

    '<div>' +

      '<strong>Endpoint:</strong> ' +

      escapeHtml(
        getOCRHostname()
      ) +

    '</div>';


  panel.appendChild(
    info
  );
}


function getOCRHostname() {

  try {

    return new URL(
      OCR_API_URL
    ).hostname;

  } catch (
    error
  ) {

    return OCR_API_URL;
  }
}


/* ==========================================================
   OCR URL
========================================================== */

function normalizeOCRBaseURL(
  value
) {

  let url =
    String(
      value || ''
    )
      .trim();


  if (
    !url
  ) {

    return '';
  }


  url =
    url.split(
      '?'
    )[0];


  url =
    url.split(
      '#'
    )[0];


  url =
    url.replace(
      /\/+$/,
      ''
    );


  url =
    url.replace(
      /\/health$/i,
      ''
    );


  url =
    url.replace(
      /\/ocr$/i,
      ''
    );


  url =
    url.replace(
      /\/+$/,
      ''
    );


  return url;
}


function getOCREndpoint(
  path
) {

  const cleanPath =
    String(
      path || ''
    )
      .replace(
        /^\/+/,
        ''
      );


  return (
    OCR_API_URL +
    '/' +
    cleanPath
  );
}


/* ==========================================================
   OCR HEALTH
========================================================== */

async function checkOCRServer() {

  const healthURL =
    getOCREndpoint(
      'health'
    );


  const text =
    document.getElementById(
      'ocrServerText'
    );


  if (
    text
  ) {

    text.textContent =
      'Checking PaddleOCR server...';
  }


  const started =
    performance.now();


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      function () {

        controller.abort();
      },
      10000
    );


  try {

    const response =
      await fetch(
        healthURL,
        {
          method:
            'GET',

          cache:
            'no-store',

          signal:
            controller.signal
        }
      );


    clearTimeout(
      timeout
    );


    if (
      !response.ok
    ) {

      throw new Error(
        'HTTP ' +
        response.status
      );
    }


    const data =
      await response.json();


    const latency =
      Math.round(
        performance.now() -
        started
      );


    if (
      data.success
    ) {

      setOCRServerState(
        true,
        'PaddleOCR online • ' +
        (
          data.version ||
          APP_VERSION
        ) +
        ' • ' +
        latency +
        ' ms'
      );

    } else {

      throw new Error(
        'Unexpected response'
      );
    }


  } catch (
    error
  ) {

    clearTimeout(
      timeout
    );


    let message =
      error.message;


    if (
      error.name ===
      'AbortError'
    ) {

      message =
        'Connection timeout';
    }


    setOCRServerState(
      false,
      'OCR server offline • ' +
      message
    );
  }
}


function setOCRServerState(
  online,
  message
) {

  const panel =
    document.getElementById(
      'ocrServerPanel'
    );


  const text =
    document.getElementById(
      'ocrServerText'
    );


  if (
    panel
  ) {

    panel.classList.remove(
      'serverOnline',
      'serverOffline'
    );


    panel.classList.add(
      online
        ? 'serverOnline'
        : 'serverOffline'
    );
  }


  if (
    text
  ) {

    text.textContent =
      message;
  }


  setSystemStatus(
    online
      ? 'OCR ready'
      : 'OCR offline',
    online
  );


  renderConnectionInfo();
}


/* ==========================================================
   LIVE SCAN
========================================================== */

async function toggleLiveScan() {

  if (
    liveScanEnabled
  ) {

    stopLiveScan(
      false
    );

    return;
  }


  if (
    !cameraStream
  ) {

    await startCamera();
  }


  if (
    !cameraStream
  ) {

    showMessage(
      'Camera could not be started.',
      'error'
    );

    return;
  }


  startLiveScan();
}


function startLiveScan() {

  if (
    liveScanEnabled
  ) {

    return;
  }


  liveScanEnabled =
    true;


  liveCandidateMac =
    null;


  liveCandidateCount =
    0;


  liveScanNumber =
    0;


  updateCompactMacResult(
    null,
    'scanning'
  );


  const button =
    document.getElementById(
      'liveScanBtn'
    );


  if (
    button
  ) {

    button.textContent =
      'STOP LIVE SCAN';


    button.style.background =
      '#d83b45';
  }


  updateLiveStatus(
    'SCANNING...',
    0
  );


  runLiveScanCycle();
}


async function runLiveScanCycle() {

  if (
    !liveScanEnabled
  ) {

    return;
  }


  if (
    !ocrBusy
  ) {

    await performLiveOCR();
  }


  if (
    !liveScanEnabled
  ) {

    return;
  }


  liveScanTimer =
    setTimeout(
      runLiveScanCycle,
      LIVE_SCAN_INTERVAL_MS
    );
}


async function performLiveOCR() {

  const video =
    document.getElementById(
      'camera'
    );


  if (
    !video ||
    !video.videoWidth
  ) {

    return;
  }


  ocrBusy =
    true;


  liveScanNumber++;


  try {

    const canvas =
      captureLiveFrame();


    const blob =
      await canvasToBlob(
        canvas,
        LIVE_JPEG_QUALITY
      );


    const form =
      new FormData();


    form.append(
      'image',
      blob,
      'live-scan.jpg'
    );


    form.append(
      'mode',
      'fast'
    );


    const started =
      performance.now();


    const response =
      await fetch(
        getOCREndpoint(
          'ocr'
        ),
        {
          method:
            'POST',

          body:
            form,

          cache:
            'no-store'
        }
      );


    const result =
      await response.json();


    const roundTrip =
      Math.round(
        performance.now() -
        started
      );


    if (
      !response.ok ||
      !result.success
    ) {

      throw new Error(
        result.message ||
        'OCR failed'
      );
    }


    if (
      !result.found ||
      !result.candidates ||
      result.candidates.length ===
      0
    ) {

      liveCandidateMac =
        null;


      liveCandidateCount =
        0;


      updateLiveStatus(
        'Scanning • ' +
        roundTrip +
        ' ms',
        0
      );


      updateCompactMacResult(
        null,
        'scanning'
      );


      return;
    }


    const mac =
      normalizeMac(
        result.candidates[0].mac
      );


    if (
      !mac
    ) {

      return;
    }


    if (
      mac ===
      liveCandidateMac
    ) {

      liveCandidateCount++;

    } else {

      liveCandidateMac =
        mac;


      liveCandidateCount =
        1;
    }


    updateCompactMacResult(
      mac,
      'detected'
    );


    updateLiveStatus(
      mac +
      ' • ' +
      roundTrip +
      ' ms',
      liveCandidateCount
    );


    if (
      liveCandidateCount >=
      LIVE_CONFIRMATION_COUNT
    ) {

      completeLiveDetection(
        mac,
        result
      );
    }


  } catch (
    error
  ) {

    console.error(
      'Live OCR:',
      error
    );


    updateLiveStatus(
      'Connection error',
      0
    );


    updateCompactMacResult(
      'Connection error',
      'error'
    );


  } finally {

    ocrBusy =
      false;
  }
}


/* ==========================================================
   LIVE FRAME
========================================================== */

function captureLiveFrame() {

  const video =
    document.getElementById(
      'camera'
    );


  const canvas =
    document.getElementById(
      'scanCanvas'
    );


  const context =
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
    sourceWidth *
    0.88;


  const cropHeight =
    scanMode ===
    'screen'
      ? sourceHeight * 0.26
      : sourceHeight * 0.42;


  const startX =
    (
      sourceWidth -
      cropWidth
    ) / 2;


  const startY =
    (
      sourceHeight -
      cropHeight
    ) / 2;


  const outputWidth =
    Math.min(
      LIVE_CAPTURE_MAX_WIDTH,
      Math.round(
        cropWidth
      )
    );


  const ratio =
    outputWidth /
    cropWidth;


  const outputHeight =
    Math.max(
      120,
      Math.round(
        cropHeight *
        ratio
      )
    );


  canvas.width =
    outputWidth;


  canvas.height =
    outputHeight;


  context.imageSmoothingEnabled =
    true;


  context.imageSmoothingQuality =
    'high';


  context.drawImage(
    video,

    startX,
    startY,

    cropWidth,
    cropHeight,

    0,
    0,

    outputWidth,
    outputHeight
  );


  return canvas;
}


function completeLiveDetection(
  mac,
  result
) {

  stopLiveScan(
    true
  );


  selectCandidate(
    mac
  );


  updateCompactMacResult(
    mac,
    'detected'
  );


  const validation =
    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {

    validation.textContent =
      'Live Scan detected the same MAC twice. Verify and confirm.';


    validation.style.color =
      '#16864b';
  }


  updateLiveStatus(
    '✓ MAC DETECTED',
    LIVE_CONFIRMATION_COUNT
  );


  showMessage(
    'MAC detected: ' +
    mac +
    ' • ' +
    (
      result.processingSeconds ??
      '?'
    ) +
    ' s OCR',
    'success'
  );
}


function stopLiveScan(
  detected
) {

  liveScanEnabled =
    false;


  if (
    liveScanTimer
  ) {

    clearTimeout(
      liveScanTimer
    );


    liveScanTimer =
      null;
  }


  const button =
    document.getElementById(
      'liveScanBtn'
    );


  if (
    button
  ) {

    button.textContent =
      'START LIVE SCAN';


    button.style.background =
      '#0878ff';
  }


  if (
    !detected
  ) {

    updateLiveStatus(
      'READY',
      0
    );


    const macInput =
      document.getElementById(
        'macInput'
      );


    if (
      !macInput ||
      !macInput.value
    ) {

      updateCompactMacResult(
        null,
        'waiting'
      );
    }
  }
}


function updateLiveStatus(
  text,
  count
) {

  const status =
    document.getElementById(
      'liveScanStatus'
    );


  const consensus =
    document.getElementById(
      'liveConsensus'
    );


  if (
    status
  ) {

    status.textContent =
      text;
  }


  if (
    consensus
  ) {

    consensus.textContent =
      Math.min(
        count,
        LIVE_CONFIRMATION_COUNT
      ) +
      ' / ' +
      LIVE_CONFIRMATION_COUNT;
  }
}


/* ==========================================================
   SCAN MODE
========================================================== */

function setScanMode(
  mode
) {

  scanMode =
    mode ===
    'label'
      ? 'label'
      : 'screen';


  const screenBtn =
    document.getElementById(
      'screenModeBtn'
    );


  const labelBtn =
    document.getElementById(
      'labelModeBtn'
    );


  const frame =
    document.getElementById(
      'scanFrame'
    );


  const hint =
    document.getElementById(
      'modeHint'
    );


  if (
    screenBtn
  ) {

    screenBtn.classList.remove(
      'active'
    );
  }


  if (
    labelBtn
  ) {

    labelBtn.classList.remove(
      'active'
    );
  }


  if (
    frame
  ) {

    frame.classList.remove(
      'screenFrame',
      'labelFrame'
    );
  }


  if (
    scanMode ===
    'screen'
  ) {

    if (
      screenBtn
    ) {

      screenBtn.classList.add(
        'active'
      );
    }


    if (
      frame
    ) {

      frame.classList.add(
        'screenFrame'
      );
    }


    if (
      hint
    ) {

      hint.textContent =
        'Optimized for MAC addresses displayed on screens.';
    }


  } else {

    if (
      labelBtn
    ) {

      labelBtn.classList.add(
        'active'
      );
    }


    if (
      frame
    ) {

      frame.classList.add(
        'labelFrame'
      );
    }


    if (
      hint
    ) {

      hint.textContent =
        'Use for stickers, printers, access points and device labels.';
    }
  }
}


/* ==========================================================
   CAMERA
========================================================== */

async function discoverCameras() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.enumerateDevices
  ) {

    showMessage(
      'Camera is not supported by this browser.',
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
          (
            index + 1
          )
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


async function startCamera(
  requestedDeviceId = null
) {

  const video =
    document.getElementById(
      'camera'
    );


  try {

    stopLiveScan(
      false
    );


    stopCamera();


    let constraints;


    if (
      requestedDeviceId
    ) {

      constraints = {

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
      };


    } else {

      constraints = {

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
      };
    }


    cameraStream =
      await navigator
        .mediaDevices
        .getUserMedia(
          {
            video:
              constraints,

            audio:
              false
          }
        );


    video.srcObject =
      cameraStream;


    await video.play();


    const placeholder =
      document.getElementById(
        'cameraPlaceholder'
      );


    if (
      placeholder
    ) {

      placeholder.classList.add(
        'hidden'
      );
    }


    const scanButton =
      document.getElementById(
        'scanBtn'
      );


    if (
      scanButton
    ) {

      scanButton.disabled =
        false;
    }


    const switchButton =
      document.getElementById(
        'switchCameraBtn'
      );


    if (
      switchButton
    ) {

      switchButton.disabled =
        false;
    }


    const startButton =
      document.getElementById(
        'startCameraBtn'
      );


    if (
      startButton
    ) {

      startButton.textContent =
        'RESTART CAMERA';
    }


    const track =
      cameraStream
        .getVideoTracks()[0];


    const settings =
      track.getSettings();


    currentDeviceId =
      settings.deviceId ||
      null;


    await discoverCameras();


    syncCameraSelector();


  } catch (
    error
  ) {

    console.error(
      'Camera error:',
      error
    );


    showMessage(
      'Camera could not be started: ' +
      error.message,
      'error'
    );
  }
}


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


  await startCamera(
    select.value
  );
}


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


  let index =
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


  index++;


  if (
    index >=
    videoDevices.length
  ) {

    index =
      0;
  }


  await startCamera(
    videoDevices[
      index
    ].deviceId
  );
}


/* ==========================================================
   MANUAL FRAME
========================================================== */

function captureCameraFrame() {

  const video =
    document.getElementById(
      'camera'
    );


  const canvas =
    document.getElementById(
      'scanCanvas'
    );


  const context =
    canvas.getContext(
      '2d'
    );


  const width =
    video.videoWidth;


  const height =
    video.videoHeight;


  const cropWidth =
    width *
    0.92;


  const cropHeight =
    scanMode ===
    'screen'
      ? height * 0.32
      : height * 0.62;


  const startX =
    (
      width -
      cropWidth
    ) / 2;


  const startY =
    (
      height -
      cropHeight
    ) / 2;


  const scale =
    1.5;


  canvas.width =
    Math.round(
      cropWidth *
      scale
    );


  canvas.height =
    Math.round(
      cropHeight *
      scale
    );


  context.drawImage(
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


  return canvas;
}


/* ==========================================================
   MANUAL SCAN
========================================================== */

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
    !video.videoWidth
  ) {

    showMessage(
      'Camera is not ready.',
      'warning'
    );

    return;
  }


  stopLiveScan(
    false
  );


  updateCompactMacResult(
    null,
    'scanning'
  );


  const canvas =
    captureCameraFrame();


  await sendCanvasToOCR(
    canvas,
    'accurate'
  );
}


/* ==========================================================
   PHOTO
========================================================== */

function scanUploadedPhoto(
  event
) {

  const file =
    event.target.files[0];


  if (
    !file
  ) {

    return;
  }


  stopLiveScan(
    false
  );


  updateCompactMacResult(
    null,
    'scanning'
  );


  const reader =
    new FileReader();


  reader.onload =
    function (
      data
    ) {

      const image =
        new Image();


      image.onload =
        async function () {

          const canvas =
            document.getElementById(
              'scanCanvas'
            );


          const context =
            canvas.getContext(
              '2d'
            );


          let width =
            image.width;


          let height =
            image.height;


          const max =
            2200;


          if (
            Math.max(
              width,
              height
            ) >
            max
          ) {

            const ratio =
              max /
              Math.max(
                width,
                height
              );


            width =
              Math.round(
                width *
                ratio
              );


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


          context.drawImage(
            image,
            0,
            0,
            width,
            height
          );


          await sendCanvasToOCR(
            canvas,
            'accurate'
          );
        };


      image.src =
        data.target.result;
    };


  reader.readAsDataURL(
    file
  );
}


/* ==========================================================
   OCR REQUEST
========================================================== */

async function sendCanvasToOCR(
  canvas,
  mode = 'accurate'
) {

  ocrBusy =
    true;


  resetOCRResult();


  setOCRStatus(
    true,
    'PaddleOCR is reading...',
    mode ===
    'fast'
      ? 'FAST OCR'
      : 'ACCURATE OCR'
  );


  try {

    const blob =
      await canvasToBlob(
        canvas,
        0.9
      );


    const form =
      new FormData();


    form.append(
      'image',
      blob,
      'mac-scan.jpg'
    );


    form.append(
      'mode',
      mode
    );


    const response =
      await fetch(
        getOCREndpoint(
          'ocr'
        ),
        {
          method:
            'POST',

          body:
            form,

          cache:
            'no-store'
        }
      );


    const result =
      await response.json();


    if (
      !response.ok ||
      !result.success
    ) {

      throw new Error(
        result.message ||
        'OCR failed'
      );
    }


    handleOCRResult(
      result
    );


  } catch (
    error
  ) {

    console.error(
      error
    );


    updateCompactMacResult(
      'OCR error',
      'error'
    );


    showMessage(
      'PaddleOCR error: ' +
      error.message,
      'error'
    );


  } finally {

    ocrBusy =
      false;


    setOCRStatus(
      false
    );
  }
}


function canvasToBlob(
  canvas,
  quality = 0.9
) {

  return new Promise(
    function (
      resolve,
      reject
    ) {

      canvas.toBlob(
        function (
          blob
        ) {

          if (
            blob
          ) {

            resolve(
              blob
            );

          } else {

            reject(
              new Error(
                'Could not create image.'
              )
            );
          }
        },

        'image/jpeg',

        quality
      );
    }
  );
}


/* ==========================================================
   OCR RESULT
========================================================== */

function handleOCRResult(
  result
) {

  if (
    !result.found ||
    !result.candidates ||
    result.candidates.length ===
    0
  ) {

    setMacState(
      'invalid',
      'MAC NOT FOUND'
    );


    updateCompactMacResult(
      'MAC not found',
      'error'
    );


    showMessage(
      'No MAC detected.',
      'warning'
    );


    return;
  }


  renderCandidates(
    result.candidates
  );


  const mac =
    result.candidates[0].mac;


  updateCompactMacResult(
    mac,
    'detected'
  );


  selectCandidate(
    mac
  );


  showMessage(
    'MAC detected in ' +
    result.processingSeconds +
    ' s • ' +
    String(
      result.mode ||
      ''
    ).toUpperCase(),
    'success'
  );
}


/* ==========================================================
   CANDIDATES
========================================================== */

function renderCandidates(
  candidates
) {

  const section =
    document.getElementById(
      'candidateSection'
    );


  const list =
    document.getElementById(
      'candidateList'
    );


  if (
    !section ||
    !list
  ) {

    return;
  }


  list.innerHTML =
    '';


  candidates.forEach(
    function (
      candidate
    ) {

      const button =
        document.createElement(
          'button'
        );


      button.className =
        'candidateBtn';


      button.innerHTML =
        escapeHtml(
          candidate.mac
        ) +
        '<small>' +
        escapeHtml(
          (
            candidate.votes ||
            1
          ) +
          ' OCR reading(s)'
        ) +
        '</small>';


      button.onclick =
        function () {

          selectCandidate(
            candidate.mac
          );


          updateCompactMacResult(
            candidate.mac,
            'detected'
          );
        };


      list.appendChild(
        button
      );
    }
  );


  section.classList.remove(
    'hidden'
  );
}


/* ==========================================================
   SELECT MAC
========================================================== */

function selectCandidate(
  mac
) {

  const normalized =
    normalizeMac(
      mac
    );


  if (
    !normalized
  ) {

    return;
  }


  const input =
    document.getElementById(
      'macInput'
    );


  if (
    input
  ) {

    input.value =
      normalized;
  }


  updateCompactMacResult(
    normalized,
    'detected'
  );


  macConfirmed =
    false;


  setMacState(
    'candidate',
    'OCR CANDIDATE'
  );


  const confirm =
    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {

    confirm.classList.remove(
      'hidden'
    );
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
}


/* ==========================================================
   MANUAL MAC INPUT
========================================================== */

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


  let clean =
    input.value
      .toUpperCase()
      .replace(
        /[^0-9A-F]/g,
        ''
      )
      .substring(
        0,
        12
      );


  const groups =
    [];


  for (
    let i = 0;
    i < clean.length;
    i += 2
  ) {

    groups.push(
      clean.substring(
        i,
        i + 2
      )
    );
  }


  input.value =
    groups.join(
      ':'
    );


  macConfirmed =
    false;


  const mac =
    normalizeMac(
      input.value
    );


  const confirm =
    document.getElementById(
      'confirmBtn'
    );


  const save =
    document.getElementById(
      'saveBtn'
    );


  if (
    mac
  ) {

    updateCompactMacResult(
      mac,
      'detected'
    );


    setMacState(
      'candidate',
      'VERIFY MAC'
    );


    if (
      confirm
    ) {

      confirm.classList.remove(
        'hidden'
      );
    }


    if (
      save
    ) {

      save.disabled =
        true;
    }


  } else {

    if (
      confirm
    ) {

      confirm.classList.add(
        'hidden'
      );
    }


    if (
      save
    ) {

      save.disabled =
        true;
    }


    if (
      input.value
    ) {

      updateCompactMacResult(
        input.value,
        'error'
      );

    } else {

      updateCompactMacResult(
        null,
        'waiting'
      );
    }


    setMacState(
      input.value
        ? 'invalid'
        : 'waiting',

      input.value
        ? 'INVALID MAC'
        : 'Waiting for scan'
    );
  }
}


/* ==========================================================
   CONFIRM MAC
========================================================== */

function confirmMac() {

  const input =
    document.getElementById(
      'macInput'
    );


  const mac =
    normalizeMac(
      input
        ? input.value
        : ''
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


  input.value =
    mac;


  macConfirmed =
    true;


  updateCompactMacResult(
    mac,
    'confirmed'
  );


  setMacState(
    'valid',
    'CONFIRMED'
  );


  const confirm =
    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {

    confirm.classList.add(
      'hidden'
    );
  }


  const save =
    document.getElementById(
      'saveBtn'
    );


  if (
    save
  ) {

    save.disabled =
      false;
  }


  showMessage(
    'MAC confirmed: ' +
    mac,
    'success'
  );
}


/* ==========================================================
   NORMALIZE MAC
========================================================== */

function normalizeMac(
  value
) {

  const clean =
    String(
      value ||
      ''
    )
      .toUpperCase()
      .replace(
        /[^0-9A-F]/g,
        ''
      );


  if (
    !/^[0-9A-F]{12}$/.test(
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


/* ==========================================================
   RESET
========================================================== */

function resetOCRResult() {

  macConfirmed =
    false;


  const section =
    document.getElementById(
      'candidateSection'
    );


  if (
    section
  ) {

    section.classList.add(
      'hidden'
    );
  }


  const list =
    document.getElementById(
      'candidateList'
    );


  if (
    list
  ) {

    list.innerHTML =
      '';
  }


  const confirm =
    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {

    confirm.classList.add(
      'hidden'
    );
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
}


function resetMacState() {

  resetOCRResult();


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


  updateCompactMacResult(
    null,
    'waiting'
  );


  setMacState(
    'waiting',
    'Waiting for scan'
  );
}


/* ==========================================================
   SAVE
========================================================== */

function saveAndNext() {

  if (
    !macConfirmed
  ) {

    showMessage(
      'Confirm the MAC Address first.',
      'warning'
    );

    return;
  }


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

    return;
  }


  const button =
    document.getElementById(
      'saveBtn'
    );


  if (
    button
  ) {

    button.disabled =
      true;


    button.textContent =
      'SAVING...';
  }


  apiRequest(
    {
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
    },

    function (
      result
    ) {

      if (
        button
      ) {

        button.textContent =
          'SAVE & SCAN NEXT';
      }


      if (
        result.success
      ) {

        resetMacState();


        loadDashboard();


        showMessage(
          'Saved: ' +
          result.mac,
          'success'
        );


      } else {

        if (
          button
        ) {

          button.disabled =
            false;
        }


        showMessage(
          result.message ||
          'Save failed.',
          'error'
        );
      }
    },

    function () {

      if (
        button
      ) {

        button.textContent =
          'SAVE & SCAN NEXT';


        button.disabled =
          false;
      }


      showMessage(
        'Could not connect to Google Apps Script.',
        'error'
      );
    }
  );
}


/* ==========================================================
   DASHBOARD
========================================================== */

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


      const count =
        document.getElementById(
          'deviceCount'
        );


      if (
        count
      ) {

        count.textContent =
          data.count ||
          0;
      }


      renderRecent(
        data.recent ||
        []
      );
    }
  );
}


/* ==========================================================
   GOOGLE JSONP
========================================================== */

function apiRequest(
  parameters,
  onSuccess,
  onError
) {

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

      script.parentNode.removeChild(
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


  script.src =
    GOOGLE_API_URL +
    '?' +
    new URLSearchParams(
      parameters
    ).toString();


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


      if (
        onError
      ) {

        onError();
      }
    };


  document.body.appendChild(
    script
  );
}


/* ==========================================================
   RECENT
========================================================== */

function renderRecent(
  items
) {

  const container =
    document.getElementById(
      'recentList'
    );


  if (
    !container
  ) {

    return;
  }


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
      .join('');
}


/* ==========================================================
   OCR UI
========================================================== */

function setOCRStatus(
  show,
  title = '',
  progress = ''
) {

  const box =
    document.getElementById(
      'ocrStatus'
    );


  if (
    !box
  ) {

    return;
  }


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


  const titleElement =
    document.getElementById(
      'ocrTitle'
    );


  const progressElement =
    document.getElementById(
      'ocrProgress'
    );


  if (
    titleElement
  ) {

    titleElement.textContent =
      title;
  }


  if (
    progressElement
  ) {

    progressElement.textContent =
      progress;
  }
}


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


function setSystemStatus(
  text,
  ready
) {

  const status =
    document.getElementById(
      'systemStatus'
    );


  if (
    !status
  ) {

    return;
  }


  status.innerHTML =
    '<span class="statusDot"></span>' +
    escapeHtml(
      text
    );


  const dot =
    status.querySelector(
      '.statusDot'
    );


  if (
    dot
  ) {

    dot.style.background =
      ready
        ? '#4cea92'
        : '#ff7474';
  }
}


/* ==========================================================
   MESSAGE
========================================================== */

function showMessage(
  message,
  type
) {

  const box =
    document.getElementById(
      'messageBox'
    );


  if (
    !box
  ) {

    return;
  }


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


/* ==========================================================
   SECURITY
========================================================== */

function escapeHtml(
  value
) {

  return String(
    value ??
    ''
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


/* ==========================================================
   CLEANUP
========================================================== */

window.addEventListener(
  'beforeunload',
  function () {

    stopLiveScan(
      false
    );


    stopCamera();
  }
);
