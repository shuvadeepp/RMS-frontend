import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'home', loadComponent: () => import('./pages/home/home-switch.component').then(m => m.HomeSwitchComponent) },
      { path: 'find-people', loadComponent: () => import('./pages/find-people/find-people.component').then(m => m.FindPeopleComponent) },
      { path: 'candidate/:matchingResultId', loadComponent: () => import('./pages/candidate/candidate.component').then(m => m.CandidateComponent) },
      { path: 'decisions', loadComponent: () => import('./pages/decisions/decisions.component').then(m => m.DecisionsComponent) },
      { path: 'projects/new', canActivate: [adminGuard],
        loadComponent: () => import('./pages/projects/add-project.component').then(m => m.AddProjectComponent) },
      { path: 'projects', loadComponent: () => import('./pages/projects/projects.component').then(m => m.ProjectsComponent) },
      { path: 'people', loadComponent: () => import('./pages/people/people.component').then(m => m.PeopleComponent) },
      { path: 'skill-growth', loadComponent: () => import('./pages/skill-growth/skill-growth.component').then(m => m.SkillGrowthComponent) },
      { path: 'learning-catalog', loadComponent: () => import('./pages/learning-catalog/learning-catalog.component').then(m => m.LearningCatalogComponent) },
      { path: 'skills', loadComponent: () => import('./pages/skills/skills.component').then(m => m.SkillsComponent) },
      { path: 'compare/:runId', loadComponent: () => import('./pages/run-compare/run-compare.component').then(m => m.RunCompareComponent) },
      { path: 'tagged-people', loadComponent: () => import('./pages/tagged-people/tagged-people.component').then(m => m.TaggedPeopleComponent) },
      { path: 'reports',loadComponent: () => import('./pages/reports/reports.component').then(m => m.ReportsComponent) },
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'home' }
];
