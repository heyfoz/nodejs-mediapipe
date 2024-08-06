/*
 * Copyright 2024 Forrest Moulin
 *
 * Portions of this code are based on MediaPipe code:
 * Copyright 2023 The MediaPipe Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * hand_face_detection.js
 */

  // Import required vision module from MediaPipe using CDN
  import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
  // Extract required classes from vision module
  const { FaceLandmarker, FilesetResolver, DrawingUtils, GestureRecognizer } = vision;

  let gestureNameMap = {};
  let faceLandmarker;
  let gestureRecognizer;
  let webcamRunning = false;
  let handGestureRunning = false;
  let delegateType = 'CPU';
  const video = document.getElementById("webcam");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const enableWebcamButton = document.getElementById("webcamButton");
  const gestureButton = document.getElementById("gestureButton");
  const gestureOutput = document.getElementById("gesture_output");
  const confidenceOutput = document.getElementById("confidence_output");
  const handednessOutput = document.getElementById("handedness_output");
  const faceOutput = document.getElementById("face_output");
  const handCountOutput = document.getElementById("hand_count_output");

  async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: delegateType // "GPU" or "CPU"
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1
    });
  }

  async function createGestureRecognizer() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: delegateType //"GPU" pr CPU
      },
      runningMode: "VIDEO", 
      numHands: 2
    });
  }

  async function loadGestureNameMap() {
    try {
      const response = await fetch('/public/json/gesture_map.json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      gestureNameMap = await response.json();
      console.log("Gesture name map loaded successfully:", gestureNameMap);
      
    } catch (error) {
      console.error("Error loading gesture name map:", error);
    }
  }


  function sendGestureToServer(gesture) {
    fetch('/save-gesture', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gesture: gesture })
    })
    .then(response => response.json())
    .then(data => {
        if (data.errors) {
            console.error('Validation errors:', data.errors);
        } else {
            console.log(data.message);
        }
    })
    .catch(error => console.error('Error:', error));
  }

  loadGestureNameMap();
  createFaceLandmarker();
  createGestureRecognizer();

  enableWebcamButton.addEventListener("click", enableCam);
  gestureButton.addEventListener("click", toggleHandGestureDetection);

  function enableCam() {
    if (!faceLandmarker || !gestureRecognizer) {
      console.log("Wait! Models not loaded yet.");
      return;
    }

    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE FACE" : "DETECT FACE";
    gestureButton.disabled = !webcamRunning;

    const constraints = {
      video: { width: 1280, height: 720 }
    };

    if (webcamRunning) {
      navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
      });
    } else {
      const stream = video.srcObject;
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
      }
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
  }

  function toggleHandGestureDetection() {
    handGestureRunning = !handGestureRunning;
    gestureButton.innerText = handGestureRunning ? "DISABLE HANDS" : "DETECT HANDS";
  }

  function updateCanvasSize() {
    const videoRatio = video.videoHeight / video.videoWidth;
    video.style.width = '100%';
    video.style.height = 'auto';
    canvasElement.style.width = '100%';
    canvasElement.style.height = 'auto';
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
  }

  async function predictWebcam() {
    updateCanvasSize();

    if (webcamRunning) {
      const startTimeMs = performance.now();
      const faceResults = await faceLandmarker.detectForVideo(video, startTimeMs);

      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (faceResults.faceLandmarks) {
        const drawingUtils = new DrawingUtils(canvasCtx);
        faceOutput.innerText = "Face landmarks detected.";
        for (const landmarks of faceResults.faceLandmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: "#C0C0C070", lineWidth: 1 }
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
            { color: "#83f47e" } // Right eyebrow color (#FF3030 is default) ff5722 is orange
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            { color: "#83f47e" } // Right eye color (#FF3030 is default) ff5722 is orange
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
            { color: "#83f47e" } // Right iris color (#FF3030 is default) ff5722 is orange
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
            { color: "#83f47e" } // Green left eyebrow color (#30FF30 is default)
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            { color: "#83f47e" } // Green left eye color (#30FF30 is default)
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
            { color: "#83f47e" } // Green left iris color (#30FF30 is default)
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            { color: "#E0E0E0" } // face outline color
          );
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_LIPS,
            { color: "#E0E0E0" } // Lips color (#E0E0E0 is default)
          );
        }
      } else {
        faceOutput.innerText = "No face landmarks detected.";
      }

      if (handGestureRunning) {
        const nowInMs = Date.now();
        const handResults = await gestureRecognizer.recognizeForVideo(video, nowInMs);

        canvasCtx.save();

        if (handResults.landmarks.length > 0) {
          const drawingUtils = new DrawingUtils(canvasCtx);
          let handIndex = 0;
          for (const landmarks of handResults.landmarks) {
            drawingUtils.drawConnectors(
              landmarks,
              GestureRecognizer.HAND_CONNECTIONS,
              { color: "#7696eb", lineWidth: 5 } // Landmark connection lines (default 00FF00)
            );
            // 21 landmark points
            drawingUtils.drawLandmarks(landmarks, { color: "#22dee5", lineWidth: 2 }); // #FF0000

            const gestures = handResults.gestures[handIndex];
            const handedness = handResults.handednesses[handIndex];
            if (gestures && gestures.length > 0) {
              const gestureName = gestures[0].categoryName;
              //gestureOutput.innerText = gesture_name_map[gestureName] || "Unknown Gesture";
              gestureOutput.innerText = gestureNameMap[gestureName] || "Unknown Gesture";
              //gestureOutput.innerText = `${gestures[0].categoryName}`;
              confidenceOutput.innerText = `${(gestures[0].score * 100).toFixed(2)}%`;
              handednessOutput.innerText = `${handedness[0].categoryName}`;
              sendGestureToServer(gestureName); // Send gesture to server
            } else {
              gestureOutput.innerText = "Not Detected";
              confidenceOutput.innerText = "100%";
              handednessOutput.innerText = "Not Detected";
            }
            handIndex++;
          }
        } else {
          gestureOutput.innerText = "Not Detected";
          confidenceOutput.innerText = "100%";
          handednessOutput.innerText = "Not Detected";
        }

        handCountOutput.innerText = `${handResults.landmarks.length}`;

        canvasCtx.restore();
      }

      window.requestAnimationFrame(predictWebcam);
    }
  }