
import React, { useEffect } from 'react';
import { OSProvider } from './context/OSContext';
import PhoneShell from './components/PhoneShell';

const App: React.FC = () => {
  // Handle viewport resizing for mobile keyboards (Capacitor/iOS/Android)
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        // Use visualViewport height (actual visible area excluding keyboard)
        // This is the robust way to handle "immersive mode" keyboard overlap
        const vh = window.visualViewport.height;
        document.documentElement.style.setProperty('--app-height', `${vh}px`);
        
        // Optional: force scroll to top to ensure alignment
        window.scrollTo(0, 0);
      } else {
        // Fallback for environments without visualViewport
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    window.addEventListener('resize', handleResize);

    // Initial calculation
    handleResize();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    // 外层容器：Mobile端背景直接为黑(被覆盖)，PC端有背景色
    <div className="h-screen w-full bg-black md:bg-neutral-900 flex items-center justify-center overflow-hidden">
      {/* PC端浏览器背景装饰 (Mobile端隐藏) */}
      <div className="hidden md:block fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black"></div>
      
      {/* 
         手机模拟器容器逻辑:
         1. Mobile (默认): fixed inset-0, z-50, w-full. 
            KEY FIX: Use h-[var(--app-height)] instead of h-full. 
            This forces the container to shrink to the visible area above the keyboard.
         2. Desktop (md以上): relative, h-[85vh], aspect-[9/19.5], 有圆角和边框
      */}
      <div 
        className={`
          fixed inset-0 w-full z-0 bg-black 
          h-[var(--app-height)]
          md:relative md:w-auto md:h-[85vh] md:aspect-[9/19.5] md:rounded-[3rem] 
          md:shadow-2xl md:border-[8px] md:border-neutral-800 md:ring-4 md:ring-black/40
          transition-all duration-300
        `}
        // CRITICAL FIX: Create a new stacking context so 'fixed' children (Modals) 
        // are contained within this div on Desktop, preventing them from covering the whole monitor.
        style={{ transform: 'translateZ(0)' }} 
      >
        
        {/* 顶部刘海 (仅在 PC 端显示，Mobile 端通常不需要或者由 OS 内部处理状态栏避让，这里选择仅PC显示以保持全屏沉浸感) */}
        <div className="hidden md:flex absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-2xl z-50 pointer-events-none justify-center items-center">
             <div className="w-16 h-1 bg-neutral-800 rounded-full"></div>
             <div className="absolute right-6 w-2 h-2 rounded-full bg-blue-900/50 box-border border border-white/10"></div>
        </div>

        {/* 侧边物理按键 (仅 PC) */}
        <div className="hidden md:block absolute -right-[10px] top-24 w-[3px] h-12 bg-neutral-700 rounded-r-md"></div>
        <div className="hidden md:block absolute -left-[10px] top-24 w-[3px] h-8 bg-neutral-700 rounded-l-md"></div>
        <div className="hidden md:block absolute -left-[10px] top-36 w-[3px] h-8 bg-neutral-700 rounded-l-md"></div>

        {/* 屏幕内容区域 */}
        <OSProvider>
          <PhoneShell />
        </OSProvider>
      </div>

      <div className="hidden md:block fixed bottom-4 right-4 text-white/20 text-xs font-mono">
        SullyOS Simulator • Phase 1.1
      </div>
    </div>
  );
};

export default App;
