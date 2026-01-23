
import React, { useEffect, useState } from 'react';
import { useOS } from '../../context/OSContext';

// TypeScript definition for Web Battery API
interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

const StatusBar: React.FC = () => {
  const { virtualTime, theme } = useOS();
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  
  // Format numbers to have leading zeros
  const format = (n: number) => n.toString().padStart(2, '0');

  // Use content color from theme
  const textColor = theme.contentColor || '#ffffff';

  useEffect(() => {
    const initBattery = async () => {
      const nav = navigator as NavigatorWithBattery;
      if (nav.getBattery) {
        try {
          const battery = await nav.getBattery();
          
          const updateBattery = () => {
            setBatteryLevel(Math.round(battery.level * 100));
            setIsCharging(battery.charging);
          };

          updateBattery();
          
          battery.addEventListener('levelchange', updateBattery);
          battery.addEventListener('chargingchange', updateBattery);

          return () => {
            battery.removeEventListener('levelchange', updateBattery);
            battery.removeEventListener('chargingchange', updateBattery);
          };
        } catch (e) {
          console.error("Battery API failed", e);
        }
      }
    };

    initBattery();
  }, []);

  return (
    <div 
        className="h-8 pt-1 w-full flex justify-between items-start px-6 text-[11px] font-bold z-50 absolute top-0 left-0 bg-transparent transition-colors duration-500 select-none pointer-events-none"
        style={{ color: textColor }}
    >
      <div className="w-1/3 pl-2">
        <span>{format(virtualTime.hours)}:{format(virtualTime.minutes)}</span>
      </div>
      <div className="w-1/3 flex justify-center">
        {/* Notch Area spacer - kept empty for visual balance */}
      </div>
      <div className="w-1/3 flex justify-end gap-1.5 items-center pr-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M1.371 8.143c5.858-5.857 15.356-5.857 21.213 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.06 0c-4.98-4.979-13.053-4.979-18.032 0a.75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182c4.1-4.1 10.749-4.1 14.85 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.062 0 8.25 8.25 0 0 0-11.667 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.204 3.182a6 6 0 0 1 8.486 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0 3.75 3.75 0 0 0-5.304 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182a1.5 1.5 0 0 1 2.122 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0l-.53-.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
        <div className="flex items-center gap-1">
          <span>{batteryLevel}%</span>
          <div className="w-5 h-2.5 border border-current rounded-[3px] p-[1px] relative opacity-80 flex items-center">
            <div 
                className={`h-full rounded-[1px] ${isCharging ? 'bg-green-400' : 'bg-current'}`} 
                style={{ width: `${batteryLevel}%` }}
            ></div>
            {isCharging && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-black">
                        <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
                    </svg>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
