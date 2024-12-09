import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { Device } from "mediasoup-client";

const SERVER_URL = "http://localhost:3000";

const App = () => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [routerRtpCapabilities, setRouterRtpCapabilities] = useState(null);
  const [sendTransport, setSendTransport] = useState(null);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to server:", newSocket.id);

      const roomId = prompt("Enter room ID:");
      newSocket.emit("joinRoom", roomId, (response) => {
        if (response.error) {
          console.error("Error joining room:", response.error);
          return;
        }
        console.log(
          "Router RTP Capabilities received:",
          response.routerRtpCapabilities
        );
        setRouterRtpCapabilities(response.routerRtpCapabilities);
      });
    });

    return () => newSocket.close();
  }, []);

  const initDevice = async () => {
    if (!routerRtpCapabilities) {
      console.warn("Router RTP Capabilities not available");
      return;
    }

    try {
      const mediasoupDevice = new Device();
      await mediasoupDevice.load({ routerRtpCapabilities });
      setDevice(mediasoupDevice);
      console.log("Mediasoup Device Initialized");
    } catch (error) {
      console.error("Error initializing Mediasoup device:", error);
    }
  };

  const createSendTransport = () => {
    if (!device) {
      console.warn("Device not initialized");
      return;
    }

    socket.emit("createTransport", (transportOptions) => {
      if (!transportOptions || transportOptions.error) {
        console.error(
          "Error creating transport:",
          transportOptions?.error || "No options received"
        );
        return;
      }

      const transport = device.createSendTransport(transportOptions);

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socket.emit("connectTransport", { dtlsParameters }, (err) => {
          if (err) {
            console.error("Transport connect error:", err);
            return errback(err);
          }
          callback();
        });
      });

      transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        socket.emit("produce", { kind, rtpParameters }, ({ id, error }) => {
          if (error) {
            console.error("Produce error:", error);
            return errback(error);
          }
          callback({ id });
        });
      });

      setSendTransport(transport);
      console.log("Send Transport Created");
    });
  };

  const produceMedia = async () => {
    if (!sendTransport) {
      console.warn("Send Transport not available");
      return;
    }
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
  
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
  
      if (videoTrack) {
        const videoElement = document.createElement("video");
        videoElement.srcObject = stream; // Attach stream to video element
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        document.body.appendChild(videoElement); // Add video to DOM
      }
  
      // Produce video track
      if (videoTrack) {
        const videoProducer = await sendTransport.produce({ track: videoTrack });
        console.log("Video Producer created:", videoProducer.id);
      }
  
      // Produce audio track
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({ track: audioTrack });
        console.log("Audio Producer created:", audioProducer.id);
      }
    } catch (error) {
      console.error("Error producing media:", error);
    }
  };
  

  return (
    <div style={{ padding: "20px" }}>
      <h1>Mediasoup Video Conference</h1>
      <button onClick={initDevice} disabled={!routerRtpCapabilities}>
        Initialize Device
      </button>
      <button onClick={createSendTransport} disabled={!device}>
        Create Send Transport
      </button>
      <button onClick={produceMedia} disabled={!sendTransport}>
        Start Producing Media
      </button>
    </div>
  );
};

export default App;
