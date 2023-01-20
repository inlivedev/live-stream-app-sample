let options = {
  origin: 'https://api.inlive.app',
  apiVersion: 'v1',
  // dynamic API Key based on input
  apiKey: '',
};
let createdStreamData = {};
let getStreamVideoData = {};

// api request func
async function apiRequest(apiKey, url, method, body) {
  const opts = {
    method: method,
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (typeof body !== 'undefined') {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  try {
    const bodyJSON = await res.json();
    return bodyJSON;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

function replaceWhiteSpace(s) {
  if (/\s/.test(s)) {
    return s.split(' ').join('-');
  } else {
    return s;
  }
}

// input own API Key
function inputAPIKey() {
  let a = document.getElementById('userAPIKey').value;
  if (a != '') {
    options.apiKey = a;
    document.getElementById('createContainer').style.display = 'flex';
    document.getElementById('apiContainer').style.display = 'none';
  } else {
    document.getElementById('warningAPIKey').innerHTML =
      '<b>Please input your API Key</b>';
  }
}

// create stream
async function createStream() {
  const url = `${options.origin}/${options.apiVersion}/streams/create`;
  try {
    const streamName = document.getElementById('inputStreamName').value;
    let checkName;

    // random the stream name if not type in the input field
    if (streamName.trim().length != '') {
      checkName = streamName;
    } else {
      checkName = Math.random().toString(36).slice(5);
    }

    // request api
    const resp = await apiRequest(options.apiKey, url, 'POST', {
      name: streamName != '' ? streamName : checkName,
      slug: streamName != '' ? replaceWhiteSpace(streamName) : checkName,
    });
    createdStreamData = resp;

    document.getElementById('createContainer').style.display = 'none';
    if (createdStreamData?.code === 200) {
      // styling - box view
      document.getElementById('mainContainer').style.display = 'flex';
      document.getElementById(
        'yourStream'
      ).innerHTML = `Stream name : <b>${createdStreamData?.data?.name}</b>`;
    } else {
      // styling - box view
      document.getElementById('mainContainerError').style.display = 'flex';
      document.getElementById(
        'createStreamErrMessage'
      ).innerHTML = `<b>Something wrong!</b> <b style="color:red;">${createdStreamData?.message}</b>`;
    }
  } catch (err) {
    console.error(err);
  }
}

// preparing stream
async function prepareStream(slug) {
  const url = `${options.origin}/${options.apiVersion}/streams/${slug}/prepare`;

  try {
    const resp = await apiRequest(options.apiKey, url, 'POST');

    //styling
    document.getElementById('startStream').style.display = 'none';
    document.getElementById('streamStatus').innerHTML =
      '<b>Preparing stream ...</b>';

    if (resp.code !== 200) {
      throw new Error('Failed to prepare stream session');
    }
  } catch (err) {
    console.error(err);
  }
}

// init stream
async function initStream(slug, peerConnection, options) {
  const streamName = createdStreamData?.name;

  const body = {
    slug: streamName,
    session_description: peerConnection?.localDescription,
  };

  try {
    const url = `${options.origin}/${options.apiVersion}/streams/${slug}/init`;

    const resp = await apiRequest(options.apiKey, url, 'POST', body);

    if (resp.code === 200) {
      const answerSDP = new RTCSessionDescription(resp.data);
      peerConnection.setRemoteDescription(answerSDP);

      //styling
      document.getElementById('streamStatus').innerHTML =
        '<b>Streaming is ready!</b>';
    } else {
      throw new Error('Failed to init stream session');
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// start stream inside start stream function
async function startStreaming(slug) {
  try {
    const url = `${options.origin}/${options.apiVersion}/streams/${slug}/start`;
    const resp = await apiRequest(options.apiKey, url, 'POST');

    if (resp.code === 200) {
      console.log('streaming started');

      // styling
      document.getElementById('streamStatus').innerHTML =
        '<b>Streaming started!</b>';
      document.getElementById('getStream').style.display = 'flex';
      document.getElementById('startStream').style.display = 'none';
      document.getElementById('endStream').style.display = 'block';

      return resp;
    } else {
      throw new Error('Failed to start stream session');
    }
  } catch (error) {
    console.error(error);
  }
}

// start stream button
async function startStream() {
  try {
    document.getElementById('streamStatus').innerHTML = '<b>Please wait</b>';
    await prepareStream(createdStreamData?.data?.id);

    const videoEl = document.querySelector('video');

    const constraints = {
      video: {
        frameRate: 30,
        width: 1200,
        height: 720,
      },
      audio: true,
    };

    const localStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = localStream;

    const servers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:34.101.121.241:3478',
          username: 'username',
          credential: 'password',
        },
      ],
    };

    const peerConnection = new RTCPeerConnection(servers);
    console.log('peerConnection', peerConnection);

    const eventKey = await getEventKey(createdStreamData?.data?.id);
    console.log(`Got Event Key ${eventKey}`)

    subscribeEvents(createdStreamData?.data?.id, peerConnection, eventKey);

    // waiting the WebRTC connection state change to connected before we start the live stream
    peerConnection.addEventListener('connectionstatechange', (event) => {
      if (peerConnection.connectionState === 'connected') {
        startStreaming(createdStreamData?.data?.id)
      }
    })

    // waiting for the local ice candidate event and send it to the server if not null
    peerConnection.addEventListener('icecandidate', async (event) => {
      if (event.candidate !== null) {
        if(event.candidate.candidate==='') {
          return
        }
        sendIceCandidate(createdStreamData?.data?.id, event.candidate.toJSON())
      }
    })

    // we use stream from the webcam that we captured from previous step
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const offerSession = await peerConnection.createOffer();
    peerConnection.setLocalDescription(offerSession);
  } catch (err) {
    console.error(err);
  }
}

// get stream
async function getStream(slug, options) {
  try {
    const url = `${options.origin}/${options.apiVersion}/streams/${slug}`;
    const apiResp = await apiRequest(options.apiKey, url, 'GET');
    getStreamVideoData = apiResp;

    // copy the live stream link to clipboard when click the button
    let element = document.getElementById('getStreamLink');
    const currentURL = window.location.origin;
    let urlLive = new URL(`${currentURL}/live.html?id=1`);
    urlLive.searchParams.set('id', getStreamVideoData?.data?.id);
    element.value = urlLive;
    element.select();
    element.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(element.value);
    document.getElementById('streamLink').innerHTML =
      '<p>Link copied to clipboard!</p>';
    document.getElementById(
      'manifestUriLink'
    ).innerHTML = `<p>Link manifest uri : ${getStreamVideoData?.data?.dash_manifest_path}</p>`;

    return apiResp;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

// end stream
async function endStream(slug) {
  try {
    const url = `${options.origin}/${options.apiVersion}/streams/${slug}/end`;
    const apiResp = await apiRequest(options.apiKey, url, 'POST');

    // if success, then will show an alert stream has ended and will reload to the initial view
    alert('Streaming ended!');
    window.location.reload();

    return apiResp;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function getEventKey(id) {
  const url = `${options.origin}/${options.apiVersion}/streams/${id}/eventkey`
  const body = {
    expiry_seconds : 36000
  }
  try {
    const resp = await apiRequest(options.apiKey, url, 'POST',body)
    if (resp.code !== 200) {
      throw new Error('Failed to prepare stream session')
    }

    return resp.data
  } catch (err) {
    console.error(err)
  }
}

async function subscribeEvents(id, peerConnection, eventKey) {
  const url = `${options.origin}/${options.apiVersion}/streams/${id}/events/${eventKey}`
  const evtSource = new EventSource(url, {
    withCredentials: true,
  });


  // we're waiting the iceCandidate event from the server and add the remote ice-candidate to our RTCPeerConnection
  evtSource.addEventListener('iceCandidate', (event) => {
    peerConnection.addIceCandidate(event.data)
  })
}

async function sendIceCandidate(streamId, iceCandidate) {
  const url = `${options.origin}/${options.apiVersion}/streams/${streamId}/ice`
  try {
    const resp = await apiRequest(options.apiKey, url, 'POST', iceCandidate)
    if (resp.code !== 200) {
      throw new Error('Failed to post ice candidate')
    }

    return true
  } catch (err) {
    console.error(err)
  }
}   