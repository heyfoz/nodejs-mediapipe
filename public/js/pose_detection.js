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
 * pose_detection.js
 */

import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Helper function for linear interpolation
function lerp(value, min, max, newMin, newMax) {
    return ((value - min) / (max - min)) * (newMax - newMin) + newMin;
}

// Ensure radius is always positive and smaller
function getRadius(data) {
    const radius = lerp(data.from.z, -0.15, 0.1, 2, 10); // Adjust multiplier for smaller size
    return Math.max(radius, 2); // Ensure radius is at least 2
}

// Get elements from the DOM
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

const cyanDotColor = "#22dee5";
const purpleLineColor = "#7696eb";

// Initialize PoseLandmarker variable
let poseLandmarker;
let runningMode = "VIDEO";
let webcamRunning = false;
let stream; // Store the webcam stream

// Create and configure the PoseLandmarker
const createPoseLandmarker = async () => {
    try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 2
        });
        console.log("Pose Landmarker loaded successfully!");
      } catch (error) {
        console.error("Error loading Pose Landmarker:", error);
    }
};

// Call the function to initialize PoseLandmarker
createPoseLandmarker();

// Check if webcam access is supported
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// Event listener for enabling webcam
if (hasGetUserMedia()) {
    const enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

// Enable webcam and start detection
function enableCam(event) {
    if (!poseLandmarker) {
        console.log("Wait! poseLandmarker not loaded yet.");
        return;
    }

    webcamRunning = !webcamRunning;

    // Change text to reflect current action
    document.getElementById('cta-prompt').innerHTML = webcamRunning
        ? 'Press <b>Stop Detection</b> below to end the webcam pose detection.'
        : 'Press <b>Start Detection</b> below to initiate the webcam pose detection.';

    if (webcamRunning) {
        const constraints = {
            video: { width: 720, height: 360 }
        };  
        navigator.mediaDevices.getUserMedia(constraints).then((mediaStream) => {
            stream = mediaStream; // Store the stream
            video.srcObject = stream;
            video.style.width = "100%";
            video.style.height = "100%";
            video.style.objectFit = "cover"; // Ensure the video covers the entire canvas without black margins
            video.style.display = "block";
            video.addEventListener("loadeddata", () => {
                canvasElement.width = video.videoWidth;
                canvasElement.height = video.videoHeight;
                canvasElement.style.display = "block";
                predictWebcam();
            });
        });
    } else {
        // Stop all tracks of the stream
        stream.getTracks().forEach((track) => track.stop());
        video.style.display = "none";
        canvasElement.style.display = "none";
    }

    const enableWebcamButton = event.target;
    enableWebcamButton.innerText = webcamRunning ? "STOP DETECTION" : "START DETECTION";
}

let lastVideoTime = -1;
async function predictWebcam() {
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            for (const landmark of result.landmarks) {
                drawingUtils.drawLandmarks(landmark, {
                    radius: (data) => getRadius(data),
                    color: cyanDotColor
                });
                drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, {
                    color: purpleLineColor
                });
            }
            canvasCtx.restore();
        });
    }

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}
