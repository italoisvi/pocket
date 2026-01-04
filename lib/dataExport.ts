// @ts-ignore - Module has types issues but works at runtime
import * as FileSystem from 'expo-file-system/legacy';
// @ts-ignore - Module has types issues but works at runtime
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import { Alert } from 'react-native';

export type ExportFormat = 'csv' | 'json';

export type ExportData = {
  expenses: any[];
  incomeCards: any[];
  budgets: any[];
  pluggyTransactions: any[];
};

// Função para buscar todos os dados do usuário
export async function fetchUserData(): Promise<ExportData | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return null;
    }

    // Buscar despesas
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    // Buscar perfil com income_cards
    const { data: profile } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', user.id)
      .single();

    // Buscar orçamentos
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', user.id);

    // Buscar transações do Open Finance
    const { data: pluggyTransactions } = await supabase
      .from('pluggy_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    return {
      expenses: expenses || [],
      incomeCards: profile?.income_cards || [],
      budgets: budgets || [],
      pluggyTransactions: pluggyTransactions || [],
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    Alert.alert('Erro', 'Não foi possível buscar os dados');
    return null;
  }
}

// Converter dados para CSV
function convertToCSV(data: any[], type: string): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Adicionar cabeçalho
  csvRows.push(headers.join(','));

  // Adicionar linhas de dados
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      // Escapar valores com vírgulas ou aspas
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        typeof value === 'object'
      ) {
        return '""';
      }
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// Exportar dados em CSV
export async function exportToCSV(exportData: ExportData): Promise<void> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    let csvContent = '';

    // Adicionar despesas
    if (exportData.expenses.length > 0) {
      csvContent += '=== DESPESAS ===\n';
      csvContent += convertToCSV(exportData.expenses, 'expenses');
      csvContent += '\n\n';
    }

    // Adicionar orçamentos
    if (exportData.budgets.length > 0) {
      csvContent += '=== ORÇAMENTOS ===\n';
      csvContent += convertToCSV(exportData.budgets, 'budgets');
      csvContent += '\n\n';
    }

    // Adicionar transações Open Finance
    if (exportData.pluggyTransactions.length > 0) {
      csvContent += '=== TRANSAÇÕES OPEN FINANCE ===\n';
      csvContent += convertToCSV(exportData.pluggyTransactions, 'transactions');
      csvContent += '\n\n';
    }

    const fileName = `pocket_export_${timestamp}.csv`;
    // @ts-ignore
    const fileUri = (FileSystem.documentDirectory || '') + fileName;

    // @ts-ignore
    await FileSystem.writeAsStringAsync(fileUri, csvContent);

    // @ts-ignore
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      // @ts-ignore
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar dados do Pocket',
      });
    } else {
      Alert.alert('Sucesso', `Arquivo salvo em: ${fileName}`);
    }
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    Alert.alert('Erro', 'Não foi possível exportar os dados');
  }
}

// Exportar dados em JSON
export async function exportToJSON(exportData: ExportData): Promise<void> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const jsonContent = JSON.stringify(exportData, null, 2);

    const fileName = `pocket_export_${timestamp}.json`;
    // @ts-ignore
    const fileUri = (FileSystem.documentDirectory || '') + fileName;

    // @ts-ignore
    await FileSystem.writeAsStringAsync(fileUri, jsonContent);

    // @ts-ignore
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      // @ts-ignore
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Exportar dados do Pocket',
      });
    } else {
      Alert.alert('Sucesso', `Arquivo salvo em: ${fileName}`);
    }
  } catch (error) {
    console.error('Error exporting to JSON:', error);
    Alert.alert('Erro', 'Não foi possível exportar os dados');
  }
}

// Função principal de exportação
export async function exportData(format: ExportFormat): Promise<void> {
  const data = await fetchUserData();
  if (!data) return;

  if (format === 'csv') {
    await exportToCSV(data);
  } else if (format === 'json') {
    await exportToJSON(data);
  }
}

// Função para fazer parse de CSV
function parseCSV(csvContent: string): any[] {
  const lines = csvContent.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.replace(/"/g, '').trim());
    const obj: any = {};

    headers.forEach((header, index) => {
      const value = values[index];
      // Tentar converter para número se possível
      if (value && !isNaN(Number(value))) {
        obj[header] = Number(value);
      } else if (value === 'true') {
        obj[header] = true;
      } else if (value === 'false') {
        obj[header] = false;
      } else if (value === '' || value === '""') {
        obj[header] = null;
      } else {
        obj[header] = value;
      }
    });

    result.push(obj);
  }

  return result;
}

// Função para importar dados de CSV
export async function importFromCSV(csvContent: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return false;
    }

    // Parse do CSV em seções
    const sections = csvContent.split('===');
    let expenses: any[] = [];
    let budgets: any[] = [];

    for (const section of sections) {
      if (section.includes('DESPESAS')) {
        const expensesData = section.split('\n').slice(1).join('\n');
        expenses = parseCSV(expensesData);
      } else if (section.includes('ORÇAMENTOS')) {
        const budgetsData = section.split('\n').slice(1).join('\n');
        budgets = parseCSV(budgetsData);
      }
    }

    let successCount = 0;
    let errorCount = 0;

    // Importar despesas
    if (expenses.length > 0) {
      for (const expense of expenses) {
        const { id, ...expenseData } = expense;
        const { error } = await supabase
          .from('expenses')
          .insert({ ...expenseData, user_id: user.id });

        if (error) {
          console.error('Error importing expense:', error);
          errorCount++;
        } else {
          successCount++;
        }
      }
    }

    // Importar orçamentos
    if (budgets.length > 0) {
      for (const budget of budgets) {
        const { id, ...budgetData } = budget;
        const { error } = await supabase
          .from('budgets')
          .insert({ ...budgetData, user_id: user.id });

        if (error) {
          console.error('Error importing budget:', error);
          errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      Alert.alert(
        'Importação parcial',
        `${successCount} itens importados com sucesso. ${errorCount} erros encontrados.`
      );
    } else {
      Alert.alert(
        'Sucesso',
        `Dados importados com sucesso! ${successCount} itens adicionados.`
      );
    }

    return true;
  } catch (error) {
    console.error('Error importing CSV:', error);
    Alert.alert('Erro', 'Não foi possível importar os dados do CSV');
    return false;
  }
}

// Função para importar dados de JSON
export async function importData(jsonContent: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return false;
    }

    // Parse do JSON
    const importedData: ExportData = JSON.parse(jsonContent);

    // Validar estrutura
    if (
      !importedData.expenses ||
      !importedData.incomeCards ||
      !importedData.budgets
    ) {
      Alert.alert('Erro', 'Formato de arquivo inválido');
      return false;
    }

    let successCount = 0;
    let errorCount = 0;

    // Importar despesas
    if (importedData.expenses.length > 0) {
      for (const expense of importedData.expenses) {
        // Remover o ID antigo e adicionar user_id atual
        const { id, ...expenseData } = expense;
        const { error } = await supabase
          .from('expenses')
          .insert({ ...expenseData, user_id: user.id });

        if (error) {
          console.error('Error importing expense:', error);
          errorCount++;
        } else {
          successCount++;
        }
      }
    }

    // Importar income_cards (atualizar no perfil)
    if (importedData.incomeCards.length > 0) {
      const { error } = await supabase
        .from('profiles')
        .update({ income_cards: importedData.incomeCards })
        .eq('id', user.id);

      if (error) {
        console.error('Error importing income cards:', error);
        errorCount++;
      }
    }

    // Importar orçamentos
    if (importedData.budgets.length > 0) {
      for (const budget of importedData.budgets) {
        const { id, ...budgetData } = budget;
        const { error } = await supabase
          .from('budgets')
          .insert({ ...budgetData, user_id: user.id });

        if (error) {
          console.error('Error importing budget:', error);
          errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      Alert.alert(
        'Importação parcial',
        `${successCount} itens importados com sucesso. ${errorCount} erros encontrados.`
      );
    } else {
      Alert.alert(
        'Sucesso',
        `Dados importados com sucesso! ${successCount} itens adicionados.`
      );
    }

    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    Alert.alert('Erro', 'Não foi possível importar os dados');
    return false;
  }
}
