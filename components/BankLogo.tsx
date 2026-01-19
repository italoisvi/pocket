import { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';

type BankLogoProps = {
  imageUrl?: string;
  bankName: string;
  primaryColor?: string;
  size?: number;
  backgroundColor?: string;
};

export function BankLogo({
  imageUrl,
  bankName,
  primaryColor,
  size = 32,
  backgroundColor = '#666',
}: BankLogoProps) {
  const [svgXml, setSvgXml] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    if (!imageUrl) {
      setImageError(true);
      setImageLoading(false);
      return;
    }

    const isSvg = imageUrl.toLowerCase().endsWith('.svg');

    if (isSvg) {
      fetch(imageUrl)
        .then((response) => {
          if (!response.ok) throw new Error('Image not found');
          return response.text();
        })
        .then((xml) => {
          if (xml.includes('<!DOCTYPE') || xml.includes('<html')) {
            throw new Error('Invalid SVG');
          }
          let processedXml = xml;
          const styleMatch = xml.match(/<style>([\s\S]*?)<\/style>/);
          const classColorMap: Record<string, string> = {};

          if (styleMatch) {
            const styleContent = styleMatch[1];
            const classMatches = styleContent.matchAll(
              /\.cls-(\d+)\s*\{[^}]*fill:\s*([^;]+);/g
            );
            for (const match of classMatches) {
              classColorMap[`cls-${match[1]}`] = match[2].trim();
            }
          }

          processedXml = processedXml.replace(
            /class="(cls-\d+)"/g,
            (match, className) => {
              const color = classColorMap[className];
              if (color && color !== 'none') {
                return `fill="${color}"`;
              }
              return 'fill="none"';
            }
          );

          processedXml = processedXml.replace(
            /<style>([\s\S]*?)<\/style>/g,
            (match, content) => {
              const withoutClasses = content.replace(
                /\.cls-\d+\s*\{[^}]*\}/g,
                ''
              );
              if (withoutClasses.trim()) {
                return `<style>${withoutClasses}</style>`;
              }
              return '';
            }
          );

          setSvgXml(processedXml);
          setImageLoading(false);
        })
        .catch(() => {
          setImageError(true);
          setImageLoading(false);
        });
    } else {
      setImageLoading(false);
    }
  }, [imageUrl]);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 4,
  };

  const placeholderStyle = {
    ...containerStyle,
    backgroundColor: primaryColor || backgroundColor,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  if (!imageUrl || imageError) {
    return (
      <View style={placeholderStyle}>
        <Text style={[styles.placeholderText, { fontSize: size * 0.5 }]}>
          {bankName.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }

  const isSvg = imageUrl.toLowerCase().endsWith('.svg');

  if (isSvg && svgXml) {
    return (
      <View style={[styles.logoContainer, containerStyle]}>
        <SvgXml xml={svgXml} width={size} height={size} />
      </View>
    );
  }

  if (isSvg && imageLoading) {
    return (
      <View style={placeholderStyle}>
        <Text style={[styles.placeholderText, { fontSize: size * 0.5 }]}>
          {bankName.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.logoContainer, containerStyle]}>
      <Image
        source={{ uri: imageUrl }}
        style={containerStyle}
        resizeMode="contain"
        onError={() => setImageError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    overflow: 'hidden',
  },
  placeholderText: {
    color: '#FFF',
    fontFamily: 'DMSans-Bold',
  },
});
