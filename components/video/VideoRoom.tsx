import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, User, Shield, VolumeX, EyeOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToCall, addSignal, subscribeToSignals, updateCallStatus, updateHostControls } from '../../services/videoCallService';
import { ScheduledCall } from '../../types/videoCall';
import { toast } from 'react-hot-toast';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export const VideoRoom: React.FC = () => {
  const { callId } = useParams<{ callId: string }>();
  const { currentUser, userRole } = useAuth();
  
  const [call, setCall] = useState<ScheduledCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [loading, setLoading] = useState(true);
  
  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(servers));
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const isAdmin = userRole === 'ADMIN' || userRole === 'COLLABORATOR';

  useEffect(() => {
    if (!callId || !currentUser) return;

    const unsubscribeCall = subscribeToCall(callId, (data) => {
      setCall(data);
      
      // Handle remote controls for students
      if (!isAdmin && localStream) {
        if (data.forceMute) {
          localStream.getAudioTracks().forEach(track => track.enabled = false);
          setIsMicOn(false);
          toast.error("O mentor desativou seu microfone.");
        }
        if (data.forceHideCamera) {
          localStream.getVideoTracks().forEach(track => track.enabled = false);
          setIsCamOn(false);
          toast.error("O mentor desativou sua câmera.");
        }
      }
    });

    const startWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        stream.getTracks().forEach((track) => {
          pc.current.addTrack(track, stream);
        });

        pc.current.ontrack = (event) => {
          setRemoteStream(event.streams[0]);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.current.onicecandidate = (event) => {
          if (event.candidate) {
            addSignal(callId, 'candidate', event.candidate.toJSON(), currentUser.uid);
          }
        };

        // Signaling logic
        if (isAdmin) {
          // Admin creates offer
          const offerDescription = await pc.current.createOffer();
          await pc.current.setLocalDescription(offerDescription);
          await addSignal(callId, 'offer', offerDescription, currentUser.uid);
        }

        const unsubscribeSignals = subscribeToSignals(callId, async (signals) => {
          for (const signal of signals) {
            if (signal.senderId === currentUser.uid) continue;

            if (signal.type === 'offer' && !isAdmin) {
              await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
              const answerDescription = await pc.current.createAnswer();
              await pc.current.setLocalDescription(answerDescription);
              await addSignal(callId, 'answer', answerDescription, currentUser.uid);
            } else if (signal.type === 'answer' && isAdmin) {
              if (!pc.current.currentRemoteDescription) {
                await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
              }
            } else if (signal.type === 'candidate') {
              try {
                await pc.current.addIceCandidate(new RTCIceCandidate(signal.data));
              } catch (e) {
                console.error("Error adding ice candidate", e);
              }
            }
          }
        });

        setLoading(false);
        return () => {
          unsubscribeSignals();
        };
      } catch (error) {
        console.error(error);
        toast.error("Erro ao acessar câmera/microfone.");
        setLoading(false);
      }
    };

    startWebRTC();

    return () => {
      unsubscribeCall();
      localStream?.getTracks().forEach(t => t.stop());
      pc.current.close();
    };
  }, [callId, currentUser]);

  const toggleMic = () => {
    if (localStream) {
      const newState = !isMicOn;
      localStream.getAudioTracks().forEach(track => track.enabled = newState);
      setIsMicOn(newState);
    }
  };

  const toggleCam = () => {
    if (localStream) {
      const newState = !isCamOn;
      localStream.getVideoTracks().forEach(track => track.enabled = newState);
      setIsCamOn(newState);
    }
  };

  const endCall = async () => {
    if (isAdmin && callId) {
      await updateCallStatus(callId, 'completed');
    }
    window.close();
  };

  const handleForceMute = async () => {
    if (callId) await updateHostControls(callId, { forceMute: true });
  };

  const handleForceHideCamera = async () => {
    if (callId) await updateHostControls(callId, { forceHideCamera: true });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-4 z-[9999]">
        <Loader2 className="animate-spin text-brand-red" size={48} />
        <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Iniciando Sala Virtual...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col z-[9999] overflow-hidden">
      {/* Main Video Area */}
      <div className="flex-1 relative grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Remote Video */}
        <div className="relative bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 flex items-center justify-center">
          {!remoteStream && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600">
                <User size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
                Aguardando participante...
              </p>
            </div>
          )}
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          
          {/* Remote Info Overlay */}
          <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-white text-xs font-bold uppercase tracking-tight">
              {isAdmin ? call?.studentName : 'Mentor'}
            </span>
          </div>

          {/* Admin Controls over Remote Video */}
          {isAdmin && remoteStream && (
            <div className="absolute top-6 right-6 flex gap-2">
              <button 
                onClick={handleForceMute}
                className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-brand-red transition-all"
                title="Mutar Aluno"
              >
                <VolumeX size={18} />
              </button>
              <button 
                onClick={handleForceHideCamera}
                className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-brand-red transition-all"
                title="Ocultar Câmera do Aluno"
              >
                <EyeOff size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Local Video */}
        <div className="relative bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 flex items-center justify-center">
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
            <span className="text-white text-xs font-bold uppercase tracking-tight">Você (Local)</span>
          </div>
          {!isCamOn && (
            <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600">
                <VideoOff size={48} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="h-24 bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-center gap-4 px-6">
        <button 
          onClick={toggleMic}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            isMicOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-brand-red text-white'
          }`}
        >
          {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button 
          onClick={toggleCam}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            isCamOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-brand-red text-white'
          }`}
        >
          {isCamOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <div className="w-px h-8 bg-zinc-800 mx-2" />

        <button 
          onClick={endCall}
          className="w-14 h-14 rounded-2xl bg-brand-red hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg shadow-red-900/20"
        >
          <PhoneOff size={24} />
        </button>

        {isAdmin && (
          <div className="absolute right-8 flex items-center gap-2 bg-brand-red/10 border border-brand-red/20 px-4 py-2 rounded-xl">
            <Shield size={14} className="text-brand-red" />
            <span className="text-brand-red text-[10px] font-black uppercase tracking-widest">Modo Mentor</span>
          </div>
        )}
      </div>
    </div>
  );
};
