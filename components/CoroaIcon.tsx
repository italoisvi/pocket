import Svg, { Path } from 'react-native-svg';

type CoroaIconProps = {
  size?: number;
  color?: string;
};

export function CoroaIcon({ size = 24, color = '#000' }: CoroaIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12,0c1.381,0,2.5,1.119,2.5,2.5s-1.119,2.5-2.5,2.5-2.5-1.119-2.5-2.5,1.119-2.5,2.5-2.5Zm9.5,5c1.381,0,2.5,1.119,2.5,2.5s-1.119,2.5-2.5,2.5-2.5-1.119-2.5-2.5,1.119-2.5,2.5-2.5Zm-19,0c1.381,0,2.5,1.119,2.5,2.5s-1.119,2.5-2.5,2.5S0,8.881,0,7.5s1.119-2.5,2.5-2.5Zm1.171,6.837l3.329,7.163h12l3.329-7.163-5.042,3.242-3.288-7.079-3.288,7.079-5.042-3.242Zm1.329,9.163v3h12v-3H5Z"
        fill={color}
      />
    </Svg>
  );
}
