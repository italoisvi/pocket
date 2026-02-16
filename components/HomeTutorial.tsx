import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TUTORIAL_SHOWN_KEY = '@pocket_home_tutorial_shown';

// Altura da tab bar (80) + safe area bottom
const TAB_BAR_HEIGHT = 80;
// Altura da status bar + safe area top
const TOP_SAFE_AREA = Platform.OS === 'ios' ? 50 : 30;

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  tooltipPosition: 'above' | 'below' | 'center';
  highlightArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius?: number;
  };
};

// Calcular posições das tabs (5 tabs, distribuídas igualmente)
const TAB_WIDTH = SCREEN_WIDTH / 5;
const TAB_Y = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Bem-vindo ao Pocket!',
    description:
      'Vamos fazer um tour rápido para você conhecer o app. É rapidinho!',
    tooltipPosition: 'center',
  },
  {
    id: 'balance',
    title: 'Seu Saldo',
    description:
      'Aqui você vê seu saldo atual. Toque no valor para ver análises detalhadas. Use o ícone do olho para esconder.',
    tooltipPosition: 'below',
    highlightArea: {
      x: 8,
      y: TOP_SAFE_AREA,
      width: 220,
      height: 60,
      borderRadius: 12,
    },
  },
  {
    id: 'profile',
    title: 'Seu Perfil',
    description:
      'Acesse seu perfil para configurar rendas e conectar contas bancárias via Open Finance.',
    tooltipPosition: 'below',
    highlightArea: {
      x: SCREEN_WIDTH - 64,
      y: TOP_SAFE_AREA,
      width: 56,
      height: 56,
      borderRadius: 28,
    },
  },
  {
    id: 'expenses',
    title: 'Suas Despesas',
    description:
      'Todos os seus gastos organizados por mês. Toque em um para ver detalhes ou editar.',
    tooltipPosition: 'below',
    highlightArea: {
      x: 8,
      y: TOP_SAFE_AREA + 80,
      width: SCREEN_WIDTH - 16,
      height: 180,
      borderRadius: 16,
    },
  },
  {
    id: 'tab_home',
    title: 'Início',
    description: 'Esta é a tela inicial onde você vê seu saldo e despesas.',
    tooltipPosition: 'above',
    highlightArea: {
      x: TAB_WIDTH * 0 + 8,
      y: TAB_Y + 8,
      width: TAB_WIDTH - 16,
      height: 50,
      borderRadius: 12,
    },
  },
  {
    id: 'tab_camera',
    title: 'Registrar Gastos',
    description:
      'Fotografe comprovantes e cupons fiscais para registrar gastos automaticamente!',
    tooltipPosition: 'above',
    highlightArea: {
      x: TAB_WIDTH * 1 + 8,
      y: TAB_Y + 8,
      width: TAB_WIDTH - 16,
      height: 50,
      borderRadius: 12,
    },
  },
  {
    id: 'tab_walts',
    title: 'Assistente Walts',
    description:
      'Seu assistente financeiro pessoal. Pergunte sobre seus gastos, peça análises e dicas!',
    tooltipPosition: 'above',
    highlightArea: {
      x: TAB_WIDTH * 2 + 8,
      y: TAB_Y + 8,
      width: TAB_WIDTH - 16,
      height: 50,
      borderRadius: 12,
    },
  },
  {
    id: 'tab_openfinance',
    title: 'Open Finance',
    description:
      'Conecte suas contas bancárias para sincronizar transações automaticamente.',
    tooltipPosition: 'above',
    highlightArea: {
      x: TAB_WIDTH * 3 + 8,
      y: TAB_Y + 8,
      width: TAB_WIDTH - 16,
      height: 50,
      borderRadius: 12,
    },
  },
  {
    id: 'tab_dividir',
    title: 'Dividir Conta',
    description: 'Divida despesas com amigos e familiares de forma fácil.',
    tooltipPosition: 'above',
    highlightArea: {
      x: TAB_WIDTH * 4 + 8,
      y: TAB_Y + 8,
      width: TAB_WIDTH - 16,
      height: 50,
      borderRadius: 12,
    },
  },
  {
    id: 'finish',
    title: 'Pronto para começar!',
    description:
      'Agora você conhece o Pocket. Comece registrando seu primeiro gasto!',
    tooltipPosition: 'center',
  },
];

type HomeTutorialProps = {
  visible: boolean;
  onComplete: () => void;
};

export function HomeTutorial({ visible, onComplete }: HomeTutorialProps) {
  const { theme, isDark } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);

  // Animações
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Fade in inicial
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Iniciar animação de pulse
      startPulseAnimation();
    }
  }, [visible]);

  useEffect(() => {
    // Animar transição entre steps
    Animated.parallel([
      Animated.timing(tooltipAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.parallel([
        Animated.spring(tooltipAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(highlightAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [currentStep]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(0);
      onComplete();
    });
  };

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  // Cores baseadas no tema
  const getOverlayColor = () => {
    if (isDark) {
      return 'rgba(0, 0, 0, 0.88)';
    }
    return 'rgba(0, 0, 0, 0.75)';
  };

  const getCardBackground = () => {
    if (isDark) {
      return '#1c1c1e';
    }
    return '#ffffff';
  };

  const getBorderColor = () => {
    if (isDark) {
      return '#3c3c3e';
    }
    return '#e0e0e0';
  };

  const getHighlightBorderColor = () => {
    return '#f7c359'; // Cor de destaque amarela (mesma do active tab)
  };

  const getButtonBackground = () => {
    return '#f7c359';
  };

  const getButtonTextColor = () => {
    return '#000000';
  };

  // Calcular posição do tooltip baseado no highlight
  const getTooltipStyle = () => {
    const baseStyle: any = {
      position: 'absolute',
      left: 16,
      right: 16,
    };

    if (!step.highlightArea || step.tooltipPosition === 'center') {
      return {
        ...baseStyle,
        top: SCREEN_HEIGHT / 2 - 120,
      };
    }

    const highlight = step.highlightArea;

    if (step.tooltipPosition === 'above') {
      // Tooltip acima do highlight
      return {
        ...baseStyle,
        bottom: SCREEN_HEIGHT - highlight.y + 20,
      };
    } else {
      // Tooltip abaixo do highlight
      return {
        ...baseStyle,
        top: highlight.y + highlight.height + 20,
      };
    }
  };

  // Renderizar overlay com "buraco" para o highlight
  const renderOverlay = () => {
    if (!step.highlightArea) {
      // Sem highlight, overlay completo
      return (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: getOverlayColor() },
          ]}
        />
      );
    }

    const h = step.highlightArea;
    const padding = 6;

    // Criar overlay com 4 retângulos ao redor do highlight
    return (
      <>
        {/* Top */}
        <Animated.View
          style={[
            styles.overlayPart,
            {
              backgroundColor: getOverlayColor(),
              top: 0,
              left: 0,
              right: 0,
              height: h.y - padding,
              opacity: highlightAnim,
            },
          ]}
        />
        {/* Bottom */}
        <Animated.View
          style={[
            styles.overlayPart,
            {
              backgroundColor: getOverlayColor(),
              top: h.y + h.height + padding,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: highlightAnim,
            },
          ]}
        />
        {/* Left */}
        <Animated.View
          style={[
            styles.overlayPart,
            {
              backgroundColor: getOverlayColor(),
              top: h.y - padding,
              left: 0,
              width: h.x - padding,
              height: h.height + padding * 2,
              opacity: highlightAnim,
            },
          ]}
        />
        {/* Right */}
        <Animated.View
          style={[
            styles.overlayPart,
            {
              backgroundColor: getOverlayColor(),
              top: h.y - padding,
              left: h.x + h.width + padding,
              right: 0,
              height: h.height + padding * 2,
              opacity: highlightAnim,
            },
          ]}
        />
      </>
    );
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Overlay com buraco */}
        {renderOverlay()}

        {/* Borda de destaque animada */}
        {step.highlightArea && (
          <Animated.View
            style={[
              styles.highlightBorder,
              {
                left: step.highlightArea.x - 4,
                top: step.highlightArea.y - 4,
                width: step.highlightArea.width + 8,
                height: step.highlightArea.height + 8,
                borderRadius: (step.highlightArea.borderRadius || 12) + 4,
                borderColor: getHighlightBorderColor(),
                opacity: highlightAnim,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        )}

        {/* Tooltip */}
        <Animated.View
          style={[
            styles.tooltipContainer,
            getTooltipStyle(),
            {
              opacity: tooltipAnim,
              transform: [
                {
                  translateY: tooltipAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.tooltip,
              {
                backgroundColor: getCardBackground(),
                borderColor: getBorderColor(),
              },
            ]}
          >
            {/* Indicador de progresso */}
            <View style={styles.progressContainer}>
              {TUTORIAL_STEPS.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressDot,
                    {
                      backgroundColor:
                        index === currentStep
                          ? '#f7c359'
                          : index < currentStep
                            ? '#f7c35980'
                            : isDark
                              ? '#3c3c3e'
                              : '#d0d0d0',
                      width: index === currentStep ? 20 : 8,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Conteúdo */}
            <Text style={[styles.tooltipTitle, { color: theme.text }]}>
              {step.title}
            </Text>

            <Text
              style={[
                styles.tooltipDescription,
                { color: theme.textSecondary },
              ]}
            >
              {step.description}
            </Text>

            {/* Botões */}
            <View style={styles.buttonContainer}>
              {!isFirstStep && !isLastStep && (
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkip}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.skipButtonText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Pular
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.nextButton,
                  { backgroundColor: getButtonBackground() },
                ]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.nextButtonText,
                    { color: getButtonTextColor() },
                  ]}
                >
                  {isLastStep
                    ? 'Começar!'
                    : isFirstStep
                      ? 'Iniciar Tour'
                      : 'Próximo'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Contador de passos */}
            <Text style={[styles.stepCounter, { color: theme.textSecondary }]}>
              {currentStep + 1} de {TUTORIAL_STEPS.length}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export async function shouldShowHomeTutorial(userId: string): Promise<boolean> {
  try {
    const shown = await AsyncStorage.getItem(`${TUTORIAL_SHOWN_KEY}_${userId}`);
    return shown !== 'true';
  } catch {
    return true;
  }
}

export async function markHomeTutorialShown(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${TUTORIAL_SHOWN_KEY}_${userId}`, 'true');
  } catch (error) {
    console.error('Erro ao salvar estado do tutorial:', error);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlayPart: {
    position: 'absolute',
  },
  highlightBorder: {
    position: 'absolute',
    borderWidth: 3,
    borderStyle: 'dashed',
  },
  tooltipContainer: {
    zIndex: 100,
  },
  tooltip: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  progressDot: {
    height: 8,
    borderRadius: 4,
  },
  tooltipTitle: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  tooltipDescription: {
    fontSize: 15,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
  },
  nextButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  stepCounter: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    marginTop: 12,
  },
});
