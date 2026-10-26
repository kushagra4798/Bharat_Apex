import { useEffect, useRef } from 'react';
import { useBharatApex } from '../context';
import { SimulationSpeed } from '../types';

let activeTimer: ReturnType<typeof setInterval> | null = null;
let currentTickFn: (() => void) | null = null;
let subscriberCount = 0;

function ensureSimulationTimer() {
  if (!activeTimer) {
    activeTimer = setInterval(() => {
      if (currentTickFn) {
        currentTickFn();
      }
    }, 2000);
  }
}

function stopSimulationTimer() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

/**
 * useSimulation hook:
 * - One timer running every 2 seconds when simulation is active.
 * - Controls simulation speed (1x, 5x, 20x) and pause / resume.
 * - Reads latest state through a ref and dispatches ONE batched SIM_TICK action per tick.
 */
export function useSimulation() {
  const { state, dispatch, toggleSimulation, setSimulationSpeed } = useBharatApex();

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    subscriberCount++;
    if (state.isSimulating) {
      currentTickFn = () => {
        const cur = stateRef.current;
        if (!cur.isSimulating) return;

        dispatch({
          type: 'SIM_TICK',
          payload: {
            realSeconds: 2,
            speedFactor: cur.simulationSpeed || 1,
          },
        });
      };
      ensureSimulationTimer();
    } else {
      stopSimulationTimer();
      currentTickFn = null;
    }

    return () => {
      subscriberCount--;
      if (subscriberCount <= 0) {
        stopSimulationTimer();
        currentTickFn = null;
      }
    };
  }, [state.isSimulating, dispatch]);

  return {
    isSimulating: state.isSimulating,
    simulationSpeed: state.simulationSpeed,
    toggleSimulation,
    setSimulationSpeed: (speed: SimulationSpeed) => setSimulationSpeed(speed),
  };
}
