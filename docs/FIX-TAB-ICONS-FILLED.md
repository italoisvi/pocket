# Fix: Ícones Preenchidos nos Menus Selecionados

## 🎯 Objetivo

Quando um menu estiver selecionado, o ícone deve:

1. Mudar para a versão **preenchida**
2. Usar a cor **`#f7c359`** (amarelo dourado)
3. Funcionar tanto no modo claro quanto no escuro

## ✅ Implementação

### 1. Novos Componentes de Ícones Preenchidos

Criados 3 novos componentes baseados nos SVGs fornecidos:

#### `components/CasaIconFilled.tsx`

```typescript
import Svg, { Path } from 'react-native-svg';

export function CasaIconFilled({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22,5.735V1.987c0-.553-.447-1-1-1s-1,.447-1,1v2.379L14.797,.855c-1.699-1.146-3.895-1.146-5.594,0L2.204,5.579c-1.38,.93-2.204,2.479-2.204,4.145v9.276c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5V9.724c0-1.579-.748-3.047-2-3.989Z"
        fill={color}
      />
    </Svg>
  );
}
```

Baseado em: `assets/icons/chamine-da-casa-em-branco-cheio.svg`

#### `components/DividirContaIconFilled.tsx`

```typescript
import Svg, { Path } from 'react-native-svg';

export function DividirContaIconFilled({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m24,12c0,.829-.672,1.5-1.5,1.5H1.5c-.829,0-1.5-.671-1.5-1.5s.671-1.5,1.5-1.5h21c.828,0,1.5.671,1.5,1.5Zm-12-5c1.381,0,2.5-1.119,2.5-2.5s-1.119-2.5-2.5-2.5-2.5,1.119-2.5,2.5,1.119,2.5,2.5,2.5Zm0,10c-1.381,0-2.5,1.119-2.5,2.5s1.119,2.5,2.5,2.5,2.5-1.119,2.5-2.5-1.119-2.5-2.5-2.5Z"
        fill={color}
      />
    </Svg>
  );
}
```

Baseado em: `assets/icons/dividircheio.svg`

#### `components/CameraIconFilled.tsx`

```typescript
import Svg, { Path, Circle } from 'react-native-svg';

export function CameraIconFilled({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.721,3,16.308,1.168A3.023,3.023,0,0,0,13.932,0H10.068A3.023,3.023,0,0,0,7.692,1.168L6.279,3Z"
        fill={color}
      />
      <Circle cx="12" cy="14" r="4" fill={color} />
      <Path
        d="M19,5H5a5.006,5.006,0,0,0-5,5v9a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V10A5.006,5.006,0,0,0,19,5ZM12,20a6,6,0,1,1,6-6A6.006,6.006,0,0,1,12,20Z"
        fill={color}
      />
    </Svg>
  );
}
```

Baseado em: `assets/icons/cameracheio.svg`

### 2. Atualização do Layout das Tabs

**Arquivo:** `app/(tabs)/_layout.tsx`

#### Mudança de cor:

```typescript
// Antes
tabBarActiveTintColor: '#ffe177',

// Depois
tabBarActiveTintColor: '#f7c359',
```

#### Lógica de ícone preenchido/outline:

```typescript
// Home
tabBarIcon: ({ color, size, focused }) =>
  focused ? (
    <CasaIconFilled size={size} color={color} />
  ) : (
    <CasaIcon size={size} color={color} />
  ),

// Dividir
tabBarIcon: ({ color, size, focused }) =>
  focused ? (
    <DividirContaIconFilled size={size} color={color} />
  ) : (
    <DividirContaIcon size={size} color={color} />
  ),

// Walts (já é sempre preenchido, só usa a cor)
tabBarIcon: ({ color, size }) => (
  <KangarooIcon
    size={size + 4}
    color={color}
    inverted={theme.background !== '#000'}
  />
),

// Adicionar
tabBarIcon: ({ color, size, focused }) =>
  focused ? (
    <CameraIconFilled size={size} color={color} />
  ) : (
    <CameraIcon size={size} color={color} />
  ),
```

## 📊 Comportamento

### Modo Claro

| Menu      | Não Selecionado  | Selecionado                 |
| --------- | ---------------- | --------------------------- |
| Início    | Outline cinza    | **Preenchido `#f7c359`** ✅ |
| Dividir   | Outline cinza    | **Preenchido `#f7c359`** ✅ |
| Walts     | Preenchido cinza | **Preenchido `#f7c359`** ✅ |
| Adicionar | Outline cinza    | **Preenchido `#f7c359`** ✅ |

### Modo Escuro

| Menu      | Não Selecionado        | Selecionado                 |
| --------- | ---------------------- | --------------------------- |
| Início    | Outline cinza claro    | **Preenchido `#f7c359`** ✅ |
| Dividir   | Outline cinza claro    | **Preenchido `#f7c359`** ✅ |
| Walts     | Preenchido cinza claro | **Preenchido `#f7c359`** ✅ |
| Adicionar | Outline cinza claro    | **Preenchido `#f7c359`** ✅ |

## 📝 Arquivos Criados/Modificados

### Criados:

1. `components/CasaIconFilled.tsx`
2. `components/DividirContaIconFilled.tsx`
3. `components/CameraIconFilled.tsx`

### Modificados:

1. `app/(tabs)/_layout.tsx` (linhas 2-8, 18, 46-51, 58-63, 83-88)

## 🎯 Resultado Final

- ✅ Cor de seleção: `#f7c359` (amarelo dourado)
- ✅ Ícones preenchidos quando selecionados
- ✅ Funciona em modo claro e escuro
- ✅ Transição suave entre estados
- ✅ Mantém ícone do Walts sempre preenchido (muda apenas a cor)
