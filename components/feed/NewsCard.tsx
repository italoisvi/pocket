import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import type { NewsItem } from '@/types/feed';

type NewsCardProps = {
  news: NewsItem;
  onPress?: () => void;
};

export function NewsCard({ news, onPress }: NewsCardProps) {
  const { isDark } = useTheme();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Detectar palavras-chave para highlight
  const highlightKeywords = ['digital', 'innovation', 'fund', 'aplicações', 'economia'];
  const titleUpper = news.title.toUpperCase();

  const renderTitle = () => {
    // Procurar por palavras-chave no título
    let highlightedText = null;
    for (const keyword of highlightKeywords) {
      const keywordUpper = keyword.toUpperCase();
      if (titleUpper.includes(keywordUpper)) {
        const parts = titleUpper.split(keywordUpper);
        if (parts.length > 1) {
          highlightedText = (
            <>
              {parts[0]}
              <Text style={styles.titleHighlight}>{keywordUpper}</Text>
              {parts.slice(1).join(keywordUpper)}
            </>
          );
          break;
        }
      }
    }

    return (
      <Text style={styles.title}>
        {highlightedText || titleUpper}
      </Text>
    );
  };

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[
        styles.container,
        {
          shadowColor: isDark ? '#fff' : '#000',
        },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      <ImageBackground
        source={
          news.imageUrl
            ? { uri: news.imageUrl }
            : undefined
        }
        style={[
          styles.imageBackground,
          !news.imageUrl && { backgroundColor: '#1F2937' },
        ]}
        imageStyle={styles.image}
      >
        {/* Overlay gradiente para legibilidade */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
          style={styles.overlay}
        />

        {/* Conteúdo */}
        <View style={styles.content}>
          {/* Badge de categoria */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>NEWS UPDATE</Text>
          </View>

          {/* Título com highlight */}
          {renderTitle()}

          {/* Footer com linha e data */}
          <View style={styles.footer}>
            <View style={styles.sourceLine} />
            <Text style={styles.date}>{formatDate(news.publishedAt)}</Text>
          </View>
        </View>
      </ImageBackground>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    overflow: 'hidden',
    height: 420,
    // Sombra profunda
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  imageBackground: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  image: {
    // Edge to edge - sem border radius
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    padding: 24,
    paddingBottom: 28,
  },
  categoryBadge: {
    alignSelf: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 20,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: '#1F2937',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    color: '#FFF',
    lineHeight: 28,
    marginBottom: 24,
    textAlign: 'center',
  },
  titleHighlight: {
    color: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceLine: {
    width: 50,
    height: 3,
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
  date: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: '#FFF',
    fontStyle: 'italic',
  },
});
