import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ScheduleItem, HistoryEntry } from './types';
import ScheduleForm from './components/ScheduleForm';
import ScheduleTable from './components/ScheduleTable';
import TimerDisplay from './components/TimerDisplay';
import { LogoIcon } from './components/icons/LogoIcon';
import { WORK_START_SOUND, BREAK_START_SOUND } from './assets/sounds';
import HistoryModal from './components/HistoryModal';
import { HistoryIcon } from './components/icons/HistoryIcon';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 200;

const drawPipFrame = (
    ctx: CanvasRenderingContext2D,
    session: ScheduleItem,
    remainingMs: number
) => {
    const isWork = session.type === 'work';
    const totalDuration = session.endTime.getTime() - session.startTime.getTime();
    const progress = totalDuration > 0 ? ((totalDuration - remainingMs) / totalDuration) * 100 : 0;
    
    const minutes = Math.floor(remainingMs / 1000 / 60);
    const seconds = Math.floor((remainingMs / 1000) % 60);
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Background
    ctx.fillStyle = '#f1f5f9'; // slate-100
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Task Text
    ctx.fillStyle = '#475569'; // slate-600
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(session.task, CANVAS_WIDTH / 2, 40, CANVAS_WIDTH - 20);

    // Timer Text
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.font = 'bold 80px monospace';
    ctx.fillText(timeString, CANVAS_WIDTH / 2, 120);

    // Bottom info for work sessions
    if (isWork) {
        ctx.fillStyle = '#475569'; // slate-600
        ctx.font = '18px sans-serif';

        // Distraction Score on the left
        ctx.textAlign = 'left';
        ctx.fillText(`Distractions: ${session.distractionScore || 0}`, 20, 180);

        // Shortcut hint on the right
        ctx.textAlign = 'right';
        ctx.fillText(`Raccourcis: Touches Média`, CANVAS_WIDTH - 20, 180);
    }


    // Progress Bar Background
    ctx.fillStyle = '#e2e8f0'; // slate-200
    ctx.fillRect(0, CANVAS_HEIGHT - 10, CANVAS_WIDTH, 10);

    // Progress Bar Fill
    ctx.fillStyle = isWork ? '#0ea5e9' : '#10b981'; // sky-500 or emerald-500
    ctx.fillRect(0, CANVAS_HEIGHT - 10, (CANVAS_WIDTH * progress) / 100, 10);
};


const App: React.FC = () => {
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [playedNotifications, setPlayedNotifications] = useState<Set<string>>(new Set());
    const [currentSession, setCurrentSession] = useState<ScheduleItem | null>(null);
    const [remainingMs, setRemainingMs] = useState(0);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [isHistoryVisible, setIsHistoryVisible] = useState(false);
    const [isPipSupported, setIsPipSupported] = useState(false);

    const pipCanvasRef = useRef<HTMLCanvasElement>(null);
    const pipVideoRef = useRef<HTMLVideoElement>(null);
    const silentAudioRef = useRef<HTMLAudioElement>(null);


    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('pomodoro-history');
            if (storedHistory) {
                const parsedHistory: HistoryEntry[] = JSON.parse(storedHistory).map((entry: any) => ({
                    ...entry,
                    schedule: entry.schedule.map((item: any) => ({
                        ...item,
                        startTime: new Date(item.startTime),
                        endTime: new Date(item.endTime),
                    }))
                }));
                setHistory(parsedHistory);
            }
        } catch (error) {
            console.error("Failed to load history from localStorage", error);
        }

        // Check for PiP support
        const videoEl = document.createElement('video');
        const canvasEl = document.createElement('canvas');
        setIsPipSupported(
            document.pictureInPictureEnabled &&
            typeof videoEl.requestPictureInPicture === 'function' &&
            typeof canvasEl.captureStream === 'function'
        );
    }, []);


    const generateSchedule = useCallback((
        startTimeStr: string,
        endTimeStr: string,
        workDuration: number,
        breakDuration: number,
        tasks: string,
        soundsOn: boolean
    ) => {
        if (schedule.length > 0) {
            const todayStr = new Date().toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const newHistoryEntry: HistoryEntry = { date: todayStr, schedule };
            
            setHistory(prevHistory => {
                const updatedHistory = [newHistoryEntry, ...prevHistory].slice(0, 30); // Keep max 30 entries
                try {
                    localStorage.setItem('pomodoro-history', JSON.stringify(updatedHistory));
                } catch (error) {
                    console.error("Failed to save history to localStorage", error);
                }
                return updatedHistory;
            });
        }
        
        const newSchedule: ScheduleItem[] = [];
        const today = new Date().toISOString().split('T')[0];
        
        const taskList = tasks.split('\n').filter(task => task.trim() !== '');
        
        let startDateTime = new Date(`${today}T${startTimeStr}`);
        let endDateTime = new Date(`${today}T${endTimeStr}`);

        if (endDateTime <= startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }

        let currentTime = new Date(startDateTime);
        let workSessionCount = 1;

        while (currentTime < endDateTime) {
            // Work Session
            let sessionEndTime = new Date(currentTime.getTime() + workDuration * 60000);
            if (sessionEndTime > endDateTime) {
                sessionEndTime = new Date(endDateTime);
            }

            const taskName = taskList.length > 0 
                ? taskList[(workSessionCount - 1) % taskList.length] 
                : `Session de travail n°${workSessionCount}`;

            newSchedule.push({
                id: `work-${workSessionCount}-${currentTime.getTime()}`,
                startTime: new Date(currentTime),
                endTime: new Date(sessionEndTime),
                task: taskName,
                type: 'work',
                status: 'incomplete',
                distractionScore: 0,
            });

            currentTime = new Date(sessionEndTime);

            if (currentTime >= endDateTime) break;
            
            // Break Session
            const timeForBreak = new Date(currentTime.getTime() + breakDuration * 60000);
            if (timeForBreak > endDateTime) break;

            const breakEndTime = new Date(timeForBreak);
             newSchedule.push({
                id: `break-${workSessionCount}-${currentTime.getTime()}`,
                startTime: new Date(currentTime),
                endTime: breakEndTime,
                task: 'Pause',
                type: 'break',
                status: 'incomplete',
            });

            currentTime = new Date(breakEndTime);
            workSessionCount++;
        }
        
        setSchedule(newSchedule);
        setSoundEnabled(soundsOn);
        setPlayedNotifications(new Set());
    }, [schedule]);

    // Effect for notification sounds
    useEffect(() => {
        if (!soundEnabled || schedule.length === 0) {
            return;
        }

        const audioClips = {
            work: new Audio(WORK_START_SOUND),
            break: new Audio(BREAK_START_SOUND),
        };

        const intervalId = setInterval(() => {
            const now = new Date();
            for (const item of schedule) {
                const timeDiff = item.startTime.getTime() - now.getTime();
                
                if (timeDiff >= 0 && timeDiff < 1000 && !playedNotifications.has(item.id)) {
                    audioClips[item.type].play().catch(e => console.error("Erreur de lecture audio :", e));
                    
                    setPlayedNotifications(prev => {
                        const newSet = new Set(prev);
                        newSet.add(item.id);
                        return newSet;
                    });
                }
            }
        }, 1000);

        return () => clearInterval(intervalId);

    }, [schedule, soundEnabled, playedNotifications]);

    // Effect for countdown timer
    useEffect(() => {
        const timerId = setInterval(() => {
            const now = new Date();
            const activeSession = schedule.find(item => now >= item.startTime && now < item.endTime);

            if (activeSession) {
                setCurrentSession(activeSession);
                const remaining = activeSession.endTime.getTime() - now.getTime();
                setRemainingMs(remaining > 0 ? remaining : 0);
            } else {
                setCurrentSession(null);
                setRemainingMs(0);
                if (document.pictureInPictureElement) {
                   document.exitPictureInPicture().catch(console.error);
                }
            }
        }, 250); // Increased frequency for smoother PiP updates

        return () => clearInterval(timerId);
    }, [schedule]);
    
    // Effect for updating the PiP canvas
    useEffect(() => {
        if (document.pictureInPictureElement && currentSession && pipCanvasRef.current) {
            const ctx = pipCanvasRef.current.getContext('2d');
            if (ctx) {
                drawPipFrame(ctx, currentSession, remainingMs);
            }
        }
    }, [currentSession, remainingMs]);


    const handleToggleStatus = useCallback((id: string) => {
        setSchedule(prevSchedule =>
            prevSchedule.map(item =>
                item.id === id
                    ? { ...item, status: item.status === 'completed' ? 'incomplete' : 'completed' }
                    : item
            )
        );
    }, []);

    const handleIncrementDistraction = useCallback((id: string) => {
        setSchedule(prevSchedule =>
            prevSchedule.map(item =>
                item.id === id && item.type === 'work'
                    ? { ...item, distractionScore: (item.distractionScore || 0) + 1 }
                    : item
            )
        );
    }, []);

    const handleDecrementDistraction = useCallback((id: string) => {
        setSchedule(prevSchedule =>
            prevSchedule.map(item =>
                item.id === id && item.type === 'work' && (item.distractionScore || 0) > 0
                    ? { ...item, distractionScore: (item.distractionScore || 0) - 1 }
                    : item
            )
        );
    }, []);

    const handleUpdateTaskName = useCallback((id: string, newName: string) => {
        if (!newName.trim()) return; // Prevent empty names
        setSchedule(prevSchedule =>
            prevSchedule.map(item =>
                item.id === id ? { ...item, task: newName.trim() } : item
            )
        );
    }, []);
    
    // Effect for Media Session API to provide global shortcuts
    useEffect(() => {
        const audioEl = silentAudioRef.current;
        if (!('mediaSession' in navigator) || !audioEl) {
            return;
        }

        if (currentSession && currentSession.type === 'work') {
            audioEl.play().catch(e => console.info("La lecture audio silencieuse nécessite une interaction de l'utilisateur.", e));

            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentSession.task,
                artist: 'Session de travail en cours',
                album: 'Programme Pomodoro',
            });

            const sessionId = currentSession.id;
            
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                handleIncrementDistraction(sessionId);
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                handleDecrementDistraction(sessionId);
            });

            return () => {
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
            };

        } else {
            audioEl.pause();
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
        }
    }, [currentSession, handleIncrementDistraction, handleDecrementDistraction]);


    const handleTogglePip = useCallback(async () => {
        if (!isPipSupported) {
            console.warn("Attempted to toggle Picture-in-Picture, but it is not supported in this environment.");
            return;
        }

        const video = pipVideoRef.current;
        const canvas = pipCanvasRef.current;
    
        if (document.pictureInPictureElement) {
            try {
                await document.exitPictureInPicture();
            } catch (error) {
                console.error("Error exiting PiP mode", error);
            }
            return;
        }
    
        if (!video || !canvas || !currentSession) return;
    
        const enterPip = async () => {
            try {
                if (document.pictureInPictureElement) return;
                await video.requestPictureInPicture();
            } catch (error) {
                console.error("Failed to enter PiP mode:", error);
                alert(`Impossible d'activer le mode Picture-in-Picture. Erreur: ${error.message}`);
            }
        };
    
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                drawPipFrame(ctx, currentSession, remainingMs);
            }
            
            // @ts-ignore
            if (!video.srcObject && canvas.captureStream) {
                 // @ts-ignore
                video.srcObject = canvas.captureStream();
            }
            
            video.play().catch(e => console.error("Error playing PiP video", e));
    
            if (video.readyState >= 1) { // HAVE_METADATA
                await enterPip();
            } else {
                video.addEventListener('loadedmetadata', enterPip, { once: true });
            }
            
        } catch (error) {
            console.error("Error setting up PiP:", error);
            alert(`Erreur de configuration du Picture-in-Picture: ${error.message}`);
        }
    }, [currentSession, remainingMs, isPipSupported]);
    
    const handleToggleHistory = () => setIsHistoryVisible(prev => !prev);

    const handleClearHistory = () => {
        setHistory([]);
        localStorage.removeItem('pomodoro-history');
        setIsHistoryVisible(false);
    };

    return (
        <div className="bg-slate-100 min-h-screen font-sans text-slate-800">
            <main className="container mx-auto px-4 py-8">
                <header className="text-center mb-8 relative">
                    <div className="flex items-center justify-center gap-4 mb-2">
                        <LogoIcon className="w-10 h-10 text-slate-700"/>
                        <h1 className="text-4xl font-bold text-slate-800">Générateur de Programme</h1>
                    </div>
                    <p className="text-lg text-slate-600">Planifiez votre journée avec la technique Pomodoro.</p>
                     <button
                        onClick={handleToggleHistory}
                        className="absolute top-0 right-0 p-3 rounded-full hover:bg-slate-200 transition-colors"
                        aria-label="Afficher l'historique"
                     >
                        <HistoryIcon className="w-7 h-7 text-slate-600" />
                    </button>
                </header>

                <TimerDisplay 
                    session={currentSession} 
                    remainingMs={remainingMs} 
                    onIncrementDistraction={handleIncrementDistraction}
                    onDecrementDistraction={handleDecrementDistraction}
                    onTogglePip={handleTogglePip}
                    isPipSupported={isPipSupported}
                />
                
                <ScheduleForm onGenerate={generateSchedule} />

                {schedule.length > 0 ? (
                    <ScheduleTable
                        schedule={schedule}
                        onToggleStatus={handleToggleStatus}
                        onIncrementDistraction={handleIncrementDistraction}
                        onDecrementDistraction={handleDecrementDistraction}
                        onUpdateTaskName={handleUpdateTaskName}
                    />
                ) : (
                    <div className="mt-12 text-center bg-white p-10 rounded-lg shadow-md border border-slate-200">
                        <h2 className="text-2xl font-semibold text-slate-700">Votre programme apparaîtra ici</h2>
                        <p className="text-slate-500 mt-2">
                            Veuillez configurer vos heures et durées ci-dessus, puis cliquez sur "Générer" pour créer votre emploi du temps personnalisé.
                        </p>
                    </div>
                )}
            </main>
             <footer className="text-center py-4 mt-8 text-slate-500 text-sm">
                <p>Créé avec React & Tailwind CSS.</p>
            </footer>
            {isHistoryVisible && (
                <HistoryModal 
                    history={history}
                    onClose={handleToggleHistory}
                    onClear={handleClearHistory}
                />
            )}
            {/* Hidden elements for Picture-in-Picture and Media Session functionality */}
            <div style={{ display: 'none' }}>
                <canvas ref={pipCanvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
                <video ref={pipVideoRef} muted playsInline />
                <audio ref={silentAudioRef} loop src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA" />
            </div>
        </div>
    );
}

export default App;
