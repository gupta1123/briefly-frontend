import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { Building2, Plus, X, RotateCcw, Save } from 'lucide-react';
import { DepartmentCategoriesProvider, useDepartmentCategories } from '../hooks/use-department-categories';
import { useAuth } from '../hooks/use-auth';

interface Department {
  id: string;
  name: string;
  categories?: string[];
}

interface DepartmentCategoriesManagementProps {
  departments: Department[];
}

function CategoryManager({ department }: { department: Department }) {
  const [newCategory, setNewCategory] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(false);
  const { categories, isLoading, updateCategories } = useDepartmentCategories();
  const { toast } = useToast();

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    
    if (categories.includes(trimmed)) {
      toast({
        title: 'Category already exists',
        description: `"${trimmed}" is already in this department's categories.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const updatedCategories = [...categories, trimmed];
      await updateCategories(updatedCategories);
      setNewCategory('');
      toast({
        title: 'Category added',
        description: `"${trimmed}" has been added to ${department.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error adding category',
        description: error.message || 'Failed to add category. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const removeCategory = async (categoryToRemove: string) => {
    try {
      const updatedCategories = categories.filter(cat => cat !== categoryToRemove);
      await updateCategories(updatedCategories);
      toast({
        title: 'Category removed',
        description: `"${categoryToRemove}" has been removed from ${department.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error removing category',
        description: error.message || 'Failed to remove category. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const resetToDefaults = async () => {
    const defaultCategories = ['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'];
    try {
      await updateCategories(defaultCategories);
      toast({
        title: 'Categories reset',
        description: `${department.name} categories have been reset to defaults.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error resetting categories',
        description: error.message || 'Failed to reset categories. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {department.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              disabled={isLoading}
            >
              {isEditing ? <Save className="w-4 h-4" /> : 'Edit'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {categories.length} categories • {isEditing ? 'Click categories to remove' : 'Read-only view'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new category (only when editing) */}
        {isEditing && (
          <div className="flex gap-2">
            <Input
              placeholder="Add new category..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button 
              onClick={addCategory} 
              disabled={!newCategory.trim() || isLoading}
              size="sm"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Categories list */}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Badge
              key={category}
              variant="secondary"
              className={`${isEditing ? 'cursor-pointer hover:bg-destructive hover:text-destructive-foreground' : ''}`}
              onClick={isEditing ? () => removeCategory(category) : undefined}
            >
              {category}
              {isEditing && <X className="w-3 h-3 ml-1" />}
            </Badge>
          ))}
        </div>

        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No categories defined for this department
          </p>
        )}

        {/* Reset to defaults (only when editing) */}
        {isEditing && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              disabled={isLoading}
              className="w-full"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Default Categories
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DepartmentCategoriesManagement({ departments }: DepartmentCategoriesManagementProps) {
  const { user } = useAuth();
  
  // Only show to admins
  if (user?.role !== 'systemAdmin') {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Access Restricted</h3>
          <p className="text-sm text-muted-foreground">
            Only administrators can manage department categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (departments.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Departments Found</h3>
          <p className="text-sm text-muted-foreground">
            Create departments first to manage their categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {departments.map((department) => (
          <DepartmentCategoriesProvider key={department.id} departmentId={department.id}>
            <CategoryManager department={department} />
          </DepartmentCategoriesProvider>
        ))}
      </div>
    </div>
  );
}
