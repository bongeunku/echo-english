import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl } from "../lib/speech";

export function useLineAudio() {
  const audioRef = useRef(null);
  const speakDoneRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceNote, setVoiceNote] = useState("미국인 자연 발음 파일로 재생합니다.");

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
    const done = speakDoneRef.current;
    speakDoneRef.current = null;
    if (done) done("stopped");
  }, []);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const speakLine = useCallback(
    ({ voice, topicId, index, speed, voiceLabel }) =>
      new Promise((resolve, reject) => {
        stopSpeech();
        const url = audioUrl({ voice, topicId, index });
        const audio = new Audio(url);
        audio.playbackRate = Number(speed) || 1;
        audio.preservesPitch = true;
        audioRef.current = audio;
        setSpeaking(true);
        setVoiceNote(`${voiceLabel || "미국 음성"} · 자연 발음 재생`);
        speakDoneRef.current = (result) => {
          if (result === "error") reject(new Error("audio missing"));
          else resolve();
        };

        audio.onended = () => {
          setSpeaking(false);
          audioRef.current = null;
          const done = speakDoneRef.current;
          speakDoneRef.current = null;
          if (done) done("ok");
        };
        audio.onerror = () => {
          setSpeaking(false);
          audioRef.current = null;
          setVoiceNote("음성 파일을 찾지 못했습니다. 페이지를 새로고침해 주세요.");
          const done = speakDoneRef.current;
          speakDoneRef.current = null;
          if (done) done("error");
        };
        audio.play().catch((err) => {
          setSpeaking(false);
          audioRef.current = null;
          speakDoneRef.current = null;
          reject(err);
        });
      }),
    [stopSpeech]
  );

  return { speaking, voiceNote, setVoiceNote, speakLine, stopSpeech };
}

export function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [micVisible, setMicVisible] = useState(false);
  const [micLabel, setMicLabel] = useState("");
  const [transcript, setTranscript] = useState("");
  const [transcriptVisible, setTranscriptVisible] = useState(false);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null;
    setListening(false);
    setMicVisible(false);
  }, []);

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  const startListening = useCallback(
    (expectedEn, onScore) => {
      stopRecognition();
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setMicVisible(true);
        setMicLabel("이 브라우저는 말하기 인식을 지원하지 않아요. 그래도 따라 말해 보세요!");
        setTranscriptVisible(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      setListening(true);
      setMicVisible(true);
      setMicLabel("따라 말해 보세요…");
      setTranscriptVisible(false);
      setTranscript("");

      recognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        const trimmed = text.trim();
        setTranscriptVisible(true);
        setTranscript(`내가 말한 것: ${trimmed}`);
        if (event.results[event.results.length - 1].isFinal && onScore) {
          onScore(trimmed, expectedEn);
        }
      };

      recognition.onerror = () => {
        setMicLabel("마이크를 확인한 뒤 다시 시도해 주세요.");
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      try {
        recognition.start();
      } catch {
        setMicLabel("마이크를 바로 다시 켤 수 없어요. 잠깐 후 다시 눌러 주세요.");
      }
    },
    [stopRecognition]
  );

  const resetMicUi = useCallback(() => {
    setMicVisible(false);
    setTranscriptVisible(false);
    setTranscript("");
  }, []);

  return {
    listening,
    micVisible,
    micLabel,
    setMicLabel,
    transcript,
    transcriptVisible,
    startListening,
    stopRecognition,
    resetMicUi,
  };
}
