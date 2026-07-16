export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      commentaires: {
        Row: {
          contenu_id: number;
          created_at: string;
          id: number;
          membre_id: string;
          parent_id: number | null;
          texte: string;
          type_contenu: Database["public"]["Enums"]["type_contenu"];
        };
        Insert: {
          contenu_id: number;
          created_at?: string;
          id?: never;
          membre_id: string;
          parent_id?: number | null;
          texte: string;
          type_contenu: Database["public"]["Enums"]["type_contenu"];
        };
        Update: {
          contenu_id?: number;
          created_at?: string;
          id?: never;
          membre_id?: string;
          parent_id?: number | null;
          texte?: string;
          type_contenu?: Database["public"]["Enums"]["type_contenu"];
        };
        Relationships: [
          {
            foreignKeyName: "commentaires_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commentaires_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "commentaires_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "commentaires";
            referencedColumns: ["id"];
          },
        ];
      };
      demandes: {
        Row: {
          cible_tous: boolean;
          created_at: string;
          description: string;
          id: number;
          lien: string | null;
          membre_id: string;
          statut: Database["public"]["Enums"]["statut_demande"];
          titre: string;
        };
        Insert: {
          cible_tous?: boolean;
          created_at?: string;
          description: string;
          id?: never;
          lien?: string | null;
          membre_id: string;
          statut?: Database["public"]["Enums"]["statut_demande"];
          titre: string;
        };
        Update: {
          cible_tous?: boolean;
          created_at?: string;
          description?: string;
          id?: never;
          lien?: string | null;
          membre_id?: string;
          statut?: Database["public"]["Enums"]["statut_demande"];
          titre?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demandes_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandes_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      demandes_cibles: {
        Row: {
          demande_id: number;
          membre_id: string;
        };
        Insert: {
          demande_id: number;
          membre_id: string;
        };
        Update: {
          demande_id?: number;
          membre_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demandes_cibles_demande_id_fkey";
            columns: ["demande_id"];
            isOneToOne: false;
            referencedRelation: "demandes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandes_cibles_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandes_cibles_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      evenements: {
        Row: {
          capacite: number | null;
          created_at: string;
          createur_id: string;
          date_event: string;
          description: string | null;
          id: number;
          lieu: string | null;
          titre: string;
        };
        Insert: {
          capacite?: number | null;
          created_at?: string;
          createur_id: string;
          date_event: string;
          description?: string | null;
          id?: never;
          lieu?: string | null;
          titre: string;
        };
        Update: {
          capacite?: number | null;
          created_at?: string;
          createur_id?: string;
          date_event?: string;
          description?: string | null;
          id?: never;
          lieu?: string | null;
          titre?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evenements_createur_id_fkey";
            columns: ["createur_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evenements_createur_id_fkey";
            columns: ["createur_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      inscriptions: {
        Row: {
          created_at: string;
          evenement_id: number;
          id: number;
          membre_id: string;
          statut: Database["public"]["Enums"]["statut_inscription"];
        };
        Insert: {
          created_at?: string;
          evenement_id: number;
          id?: never;
          membre_id: string;
          statut?: Database["public"]["Enums"]["statut_inscription"];
        };
        Update: {
          created_at?: string;
          evenement_id?: number;
          id?: never;
          membre_id?: string;
          statut?: Database["public"]["Enums"]["statut_inscription"];
        };
        Relationships: [
          {
            foreignKeyName: "inscriptions_evenement_id_fkey";
            columns: ["evenement_id"];
            isOneToOne: false;
            referencedRelation: "evenements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inscriptions_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inscriptions_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      invites: {
        Row: {
          categorie: string | null;
          created_at: string;
          cree_par: string | null;
          email: string;
          entreprise: string | null;
          id: number;
          membre_id: string | null;
          nom: string;
          notes: string | null;
          prenom: string;
          statut_conversion: string;
          telephone: string | null;
        };
        Insert: {
          categorie?: string | null;
          created_at?: string;
          cree_par?: string | null;
          email: string;
          entreprise?: string | null;
          id?: never;
          membre_id?: string | null;
          nom: string;
          notes?: string | null;
          prenom: string;
          statut_conversion?: string;
          telephone?: string | null;
        };
        Update: {
          categorie?: string | null;
          created_at?: string;
          cree_par?: string | null;
          email?: string;
          entreprise?: string | null;
          id?: never;
          membre_id?: string | null;
          nom?: string;
          notes?: string | null;
          prenom?: string;
          statut_conversion?: string;
          telephone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invites_cree_par_fkey";
            columns: ["cree_par"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_cree_par_fkey";
            columns: ["cree_par"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "invites_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      invites_presences: {
        Row: {
          created_at: string;
          date_reunion: string;
          id: number;
          invite_id: number;
        };
        Insert: {
          created_at?: string;
          date_reunion: string;
          id?: never;
          invite_id: number;
        };
        Update: {
          created_at?: string;
          date_reunion?: string;
          id?: never;
          invite_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invites_presences_invite_id_fkey";
            columns: ["invite_id"];
            isOneToOne: false;
            referencedRelation: "invites";
            referencedColumns: ["id"];
          },
        ];
      };
      membres: {
        Row: {
          categorie: string | null;
          created_at: string;
          date_entree: string;
          email: string;
          entreprise: string | null;
          id: string;
          mdp_defini: boolean;
          nom: string;
          photo_url: string | null;
          prenom: string;
          role: Database["public"]["Enums"]["role_membre"];
          site_web: string | null;
          statut: Database["public"]["Enums"]["statut_membre"];
          telephone: string | null;
        };
        Insert: {
          categorie?: string | null;
          created_at?: string;
          date_entree?: string;
          email: string;
          entreprise?: string | null;
          id: string;
          mdp_defini?: boolean;
          nom: string;
          photo_url?: string | null;
          prenom: string;
          role?: Database["public"]["Enums"]["role_membre"];
          site_web?: string | null;
          statut?: Database["public"]["Enums"]["statut_membre"];
          telephone?: string | null;
        };
        Update: {
          categorie?: string | null;
          created_at?: string;
          date_entree?: string;
          email?: string;
          entreprise?: string | null;
          id?: string;
          mdp_defini?: boolean;
          nom?: string;
          photo_url?: string | null;
          prenom?: string;
          role?: Database["public"]["Enums"]["role_membre"];
          site_web?: string | null;
          statut?: Database["public"]["Enums"]["statut_membre"];
          telephone?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          contenu_id: number;
          created_at: string;
          id: number;
          lu: boolean;
          membre_id: string;
          titre: string;
          type_contenu: Database["public"]["Enums"]["type_contenu"];
        };
        Insert: {
          contenu_id: number;
          created_at?: string;
          id?: never;
          lu?: boolean;
          membre_id: string;
          titre: string;
          type_contenu: Database["public"]["Enums"]["type_contenu"];
        };
        Update: {
          contenu_id?: number;
          created_at?: string;
          id?: never;
          lu?: boolean;
          membre_id?: string;
          titre?: string;
          type_contenu?: Database["public"]["Enums"]["type_contenu"];
        };
        Relationships: [
          {
            foreignKeyName: "notifications_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      options_sondage: {
        Row: {
          id: number;
          libelle: string;
          sondage_id: number;
        };
        Insert: {
          id?: never;
          libelle: string;
          sondage_id: number;
        };
        Update: {
          id?: never;
          libelle?: string;
          sondage_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "options_sondage_sondage_id_fkey";
            columns: ["sondage_id"];
            isOneToOne: false;
            referencedRelation: "sondages";
            referencedColumns: ["id"];
          },
        ];
      };
      presences: {
        Row: {
          created_at: string;
          id: number;
          membre_id: string;
          semaine_id: number;
          statut: Database["public"]["Enums"]["statut_presence"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          membre_id: string;
          semaine_id: number;
          statut: Database["public"]["Enums"]["statut_presence"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          membre_id?: string;
          semaine_id?: number;
          statut?: Database["public"]["Enums"]["statut_presence"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presences_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presences_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "presences_semaine_id_fkey";
            columns: ["semaine_id"];
            isOneToOne: false;
            referencedRelation: "semaines";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: number;
          membre_id: string;
          p256dh: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: never;
          membre_id: string;
          p256dh: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: never;
          membre_id?: string;
          p256dh?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      rappel_config: {
        Row: {
          actif: boolean;
          cibler_sans_saisie: boolean;
          derniere_execution: string | null;
          heure: number;
          id: number;
          jour_semaine: number;
          message: string;
        };
        Insert: {
          actif?: boolean;
          cibler_sans_saisie?: boolean;
          derniere_execution?: string | null;
          heure?: number;
          id?: number;
          jour_semaine?: number;
          message?: string;
        };
        Update: {
          actif?: boolean;
          cibler_sans_saisie?: boolean;
          derniere_execution?: string | null;
          heure?: number;
          id?: number;
          jour_semaine?: number;
          message?: string;
        };
        Relationships: [];
      };
      reco_participants: {
        Row: {
          membre_id: string;
          recommandation_id: number;
        };
        Insert: {
          membre_id: string;
          recommandation_id: number;
        };
        Update: {
          membre_id?: string;
          recommandation_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reco_participants_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reco_participants_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "reco_participants_recommandation_id_fkey";
            columns: ["recommandation_id"];
            isOneToOne: false;
            referencedRelation: "recommandations";
            referencedColumns: ["id"];
          },
        ];
      };
      recommandations: {
        Row: {
          contact_externe: string | null;
          created_at: string;
          id: number;
          membre_cible_id: string | null;
          membre_id: string;
          montant: number | null;
          notes: string | null;
          semaine_id: number;
          type: Database["public"]["Enums"]["type_recommandation"];
          valide: boolean;
        };
        Insert: {
          contact_externe?: string | null;
          created_at?: string;
          id?: never;
          membre_cible_id?: string | null;
          membre_id: string;
          montant?: number | null;
          notes?: string | null;
          semaine_id: number;
          type: Database["public"]["Enums"]["type_recommandation"];
          valide?: boolean;
        };
        Update: {
          contact_externe?: string | null;
          created_at?: string;
          id?: never;
          membre_cible_id?: string | null;
          membre_id?: string;
          montant?: number | null;
          notes?: string | null;
          semaine_id?: number;
          type?: Database["public"]["Enums"]["type_recommandation"];
          valide?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recommandations_membre_cible_id_fkey";
            columns: ["membre_cible_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommandations_membre_cible_id_fkey";
            columns: ["membre_cible_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "recommandations_semaine_id_fkey";
            columns: ["semaine_id"];
            isOneToOne: false;
            referencedRelation: "semaines";
            referencedColumns: ["id"];
          },
        ];
      };
      semaines: {
        Row: {
          date_debut: string;
          date_fin: string;
          id: number;
          libelle: string;
          sans_reunion: boolean;
        };
        Insert: {
          date_debut: string;
          date_fin: string;
          id?: never;
          libelle: string;
          sans_reunion?: boolean;
        };
        Update: {
          date_debut?: string;
          date_fin?: string;
          id?: never;
          libelle?: string;
          sans_reunion?: boolean;
        };
        Relationships: [];
      };
      sondages: {
        Row: {
          created_at: string;
          createur_id: string;
          date_limite: string | null;
          id: number;
          question: string;
          statut: Database["public"]["Enums"]["statut_sondage"];
          titre: string;
        };
        Insert: {
          created_at?: string;
          createur_id: string;
          date_limite?: string | null;
          id?: never;
          question: string;
          statut?: Database["public"]["Enums"]["statut_sondage"];
          titre: string;
        };
        Update: {
          created_at?: string;
          createur_id?: string;
          date_limite?: string | null;
          id?: never;
          question?: string;
          statut?: Database["public"]["Enums"]["statut_sondage"];
          titre?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sondages_createur_id_fkey";
            columns: ["createur_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sondages_createur_id_fkey";
            columns: ["createur_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
        ];
      };
      votes: {
        Row: {
          created_at: string;
          id: number;
          membre_id: string;
          option_id: number;
          sondage_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          membre_id: string;
          option_id: number;
          sondage_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          membre_id?: string;
          option_id?: number;
          sondage_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "votes_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "votes_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "options_sondage";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_sondage_id_fkey";
            columns: ["sondage_id"];
            isOneToOne: false;
            referencedRelation: "sondages";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_annuaire_public: {
        Row: {
          categorie: string | null;
          email: string | null;
          entreprise: string | null;
          id: string | null;
          nom: string | null;
          photo_url: string | null;
          prenom: string | null;
          role: Database["public"]["Enums"]["role_membre"] | null;
          site_web: string | null;
          telephone: string | null;
        };
        Relationships: [];
      };
      v_palmares_semaine: {
        Row: {
          ca_valide: number | null;
          membre: string | null;
          membre_id: string | null;
          nb_recos: number | null;
          nb_tete_a_tete: number | null;
          rang: number | null;
          semaine_id: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "recommandations_semaine_id_fkey";
            columns: ["semaine_id"];
            isOneToOne: false;
            referencedRelation: "semaines";
            referencedColumns: ["id"];
          },
        ];
      };
      v_stats_membre_semaine: {
        Row: {
          ca_valide: number | null;
          membre_id: string | null;
          nb_merci: number | null;
          nb_reco_externe: number | null;
          nb_reco_interne: number | null;
          nb_tete_a_tete: number | null;
          semaine_id: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "membres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommandations_membre_id_fkey";
            columns: ["membre_id"];
            isOneToOne: false;
            referencedRelation: "v_taux_presence_membre";
            referencedColumns: ["membre_id"];
          },
          {
            foreignKeyName: "recommandations_semaine_id_fkey";
            columns: ["semaine_id"];
            isOneToOne: false;
            referencedRelation: "semaines";
            referencedColumns: ["id"];
          },
        ];
      };
      v_taux_presence_membre: {
        Row: {
          membre_id: string | null;
          nb_absent: number | null;
          nb_present: number | null;
          nb_reunions_dues: number | null;
          nom: string | null;
          prenom: string | null;
          taux_presence: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      detail_presence_periode: {
        Args: { p_debut: string; p_fin: string };
        Returns: {
          date_debut: string;
          libelle: string;
          membre_id: string;
          nom: string;
          prenom: string;
          semaine_id: number;
          statut: Database["public"]["Enums"]["statut_presence"];
        }[];
      };
      envoyer_rappel_contributions: { Args: never; Returns: undefined };
      est_admin: { Args: never; Returns: boolean };
      est_bureau: { Args: never; Returns: boolean };
      est_comite: { Args: never; Returns: boolean };
      est_comite_fetes: { Args: never; Returns: boolean };
      est_gestionnaire_invites: { Args: never; Returns: boolean };
      get_or_create_semaine: { Args: { p_date?: string }; Returns: number };
      set_semaine_sans_reunion: {
        Args: { p_sans_reunion: boolean; p_semaine_id: number };
        Returns: undefined;
      };
      stats_presence_periode: {
        Args: { p_debut: string; p_fin: string };
        Returns: {
          membre_id: string;
          nb_absent: number;
          nb_excuse: number;
          nb_present: number;
          nb_reunions_dues: number;
          nom: string;
          prenom: string;
          taux_presence: number;
        }[];
      };
    };
    Enums: {
      role_membre: "admin" | "bureau" | "membre" | "comite_membres" | "comite_fetes";
      statut_demande: "ouverte" | "cloturee";
      statut_inscription: "present" | "absent" | "peut_etre";
      statut_membre: "actif" | "inactif";
      statut_presence: "present" | "absent";
      statut_sondage: "ouvert" | "cloture";
      type_contenu: "recommandation" | "sondage" | "evenement" | "demande" | "rappel" | "invite";
      type_recommandation: "tete_a_tete" | "reco_interne" | "reco_externe" | "merci_business";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      role_membre: ["admin", "bureau", "membre", "comite_membres", "comite_fetes"],
      statut_demande: ["ouverte", "cloturee"],
      statut_inscription: ["present", "absent", "peut_etre"],
      statut_membre: ["actif", "inactif"],
      statut_presence: ["present", "absent"],
      statut_sondage: ["ouvert", "cloture"],
      type_contenu: ["recommandation", "sondage", "evenement", "demande", "rappel", "invite"],
      type_recommandation: ["tete_a_tete", "reco_interne", "reco_externe", "merci_business"],
    },
  },
} as const;
