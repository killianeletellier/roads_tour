export const getManeuverInstruction = (type: string, modifier?: string): string => {
  if (type === 'roundabout' || type === 'rotary') return 'Prenez le rond-point';
  if (type === 'arrive') return 'Vous êtes arrivé';
  if (type === 'depart') return 'Démarrez';
  if (type === 'off ramp') {
    return modifier?.includes('right') ? 'Prenez la sortie à droite' : 'Prenez la sortie à gauche';
  }
  if (type === 'on ramp') {
    return modifier?.includes('right') ? 'Prenez la bretelle à droite' : 'Prenez la bretelle à gauche';
  }
  if (type === 'fork') {
    return modifier?.includes('right') ? 'Restez à droite' : 'Restez à gauche';
  }
  if (type === 'merge') {
    return modifier?.includes('right') ? 'Rejoignez la voie de droite' : 'Rejoignez la voie de gauche';
  }
  if (type === 'end of road') {
    return modifier?.includes('right') ? 'Au bout, tournez à droite' : 'Au bout, tournez à gauche';
  }
  switch (modifier) {
    case 'uturn':
      return 'Faites demi-tour';
    case 'sharp right':
      return 'Tournez fortement à droite';
    case 'right':
      return 'Tournez à droite';
    case 'slight right':
      return 'Gardez la droite';
    case 'straight':
      return 'Continuez tout droit';
    case 'slight left':
      return 'Gardez la gauche';
    case 'left':
      return 'Tournez à gauche';
    case 'sharp left':
      return 'Tournez fortement à gauche';
    default:
      if (type === 'turn') return 'Tournez';
      if (type === 'continue' || type === 'new name') return 'Continuez tout droit';
      return 'Continuez';
  }
};

export const formatInstructionDistance = (meters: number): string => {
  if (meters >= 1000) return `Dans ${(meters / 1000).toFixed(1)} km`;
  if (meters >= 200) return `Dans ${Math.round(meters / 50) * 50} m`;
  return `Dans ${Math.round(meters)} m`;
};

export const formatNavInstruction = (
  type: string,
  modifier: string | undefined,
  distanceM: number,
): string => {
  const distance = formatInstructionDistance(distanceM);
  const maneuver = getManeuverInstruction(type, modifier);
  return `${distance}, ${maneuver.charAt(0).toLowerCase()}${maneuver.slice(1)}`;
};
